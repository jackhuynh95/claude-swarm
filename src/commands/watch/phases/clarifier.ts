import type { ClassifiedIssue } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, ensureLabelExists, addComment } from './label-manager.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BOT_MARKER = '<!-- claude-swarm:clarify -->';
const READY_SIGNAL = 'READY_TO_PROCEED';

export interface ClarifyResult {
  ready: boolean;
  questionsPosted: boolean;
  questions?: string;
}

/**
 * Analyze issue spec for clarity, post questions if ambiguous, poll for replies.
 *
 * First call (no sinceTimestamp): analyze issue + maybe post questions.
 * Re-entry (with sinceTimestamp): check for human reply.
 */
export async function executeClarifyPhase(
  classified: ClassifiedIssue,
  config: { repo: string; autoMode: boolean },
  sinceTimestamp?: string,
): Promise<ClarifyResult> {
  const { issue } = classified;

  // Re-entry: check for human reply
  if (sinceTimestamp) {
    return checkForReply(config.repo, issue.number, sinceTimestamp);
  }

  // First call: analyze clarity
  const analysis = await analyzeClarityNeed(classified, config.autoMode);

  if (analysis.ready) {
    return { ready: true, questionsPosted: false };
  }

  // Post clarifying questions
  await postClarifyingQuestions(config.repo, issue.number, analysis.questions!);
  return { ready: false, questionsPosted: true, questions: analysis.questions };
}

/**
 * Ask Claude to review issue spec for ambiguity.
 */
async function analyzeClarityNeed(
  classified: ClassifiedIssue,
  autoMode: boolean,
): Promise<ClarifyResult> {
  const { issue } = classified;
  const prompt = [
    `Analyze this GitHub issue spec for ambiguity or missing information.`,
    `If the issue is clear enough to implement, reply with exactly: ${READY_SIGNAL}`,
    `If anything is ambiguous or underspecified, list numbered questions.`,
    ``,
    `Issue #${issue.number}: ${issue.title}`,
    ``,
    issue.body ?? '(no body)',
  ].join('\n');

  const result = await invokeClaudePhase(
    prompt, 'clarify', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, autoMode,
  );

  const output = result.output ?? '';
  if (output.includes(READY_SIGNAL)) {
    return { ready: true, questionsPosted: false };
  }

  return { ready: false, questionsPosted: false, questions: output };
}

/**
 * Post formatted clarifying questions as issue comment.
 */
async function postClarifyingQuestions(
  repo: string,
  issueNum: number,
  questions: string,
): Promise<void> {
  const body = [
    '**Clarification needed** before implementation:',
    '',
    questions,
    '',
    '---',
    '*Please reply to this comment to unblock automated processing.*',
    BOT_MARKER,
  ].join('\n');

  await ensureLabelExists(repo, 'needs-clarification', 'Waiting for spec clarification', 'fbca04');
  await addComment(repo, issueNum, body);
  await transitionLabel(repo, issueNum, undefined, 'needs-clarification');
}

/**
 * Check if a human replied to the bot's clarifying questions.
 * Filters out bot comments by looking for the marker HTML comment.
 */
async function checkForReply(
  repo: string,
  issueNum: number,
  sinceTimestamp: string,
): Promise<ClarifyResult> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'issue', 'view', String(issueNum),
      '--json', 'comments',
      '-R', repo,
    ]);

    const data = JSON.parse(stdout) as {
      comments: Array<{ body: string; createdAt: string }>;
    };

    const sinceDate = new Date(sinceTimestamp);
    const humanReplies = data.comments.filter((c) => {
      const isAfter = new Date(c.createdAt) > sinceDate;
      const isBot = c.body.includes(BOT_MARKER);
      return isAfter && !isBot;
    });

    if (humanReplies.length > 0) {
      // Human replied — remove label and proceed
      await transitionLabel(repo, issueNum, 'needs-clarification', undefined);
      return { ready: true, questionsPosted: false };
    }

    return { ready: false, questionsPosted: true };
  } catch {
    // API error — report not ready, watcher retries
    return { ready: false, questionsPosted: true };
  }
}
