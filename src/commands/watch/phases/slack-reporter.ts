import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import type { VerifyVerdict } from './verifier.js';

export interface SlackReporterConfig {
  repo: string;
  autoMode: boolean;
  webhookUrl?: string;    // direct Slack webhook (optional)
  cwd?: string;
}

/**
 * Post-ship Slack reporting — best-effort, never blocks pipeline.
 * Uses haiku (cheapest model) for 1-turn summary formatting.
 */
export async function executeSlackReport(
  classified: ClassifiedIssue,
  config: SlackReporterConfig,
  flowResults: PhaseResult[],
  verifyVerdict?: VerifyVerdict,
): Promise<PhaseResult> {
  try {
    const summary = buildSummary(classified, flowResults, verifyVerdict);
    const prompt = buildSlackPrompt(classified, summary);

    const result = await invokeClaudePhase(
      prompt, 'slack_report', undefined, config.autoMode, config.cwd,
    );
    return result;
  } catch (err) {
    // Never block pipeline — return graceful failure
    return {
      phase: 'slack_report',
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
      durationMs: 0,
    };
  }
}

interface SlackSummary {
  issueNum: number;
  title: string;
  repo: string;
  verdict: string;
  prUrl: string;
  durationFormatted: string;
  phasesPassed: number;
  phasesTotal: number;
}

function buildSummary(
  classified: ClassifiedIssue,
  flowResults: PhaseResult[],
  verifyVerdict?: VerifyVerdict,
): SlackSummary {
  const totalMs = flowResults.reduce((sum, r) => sum + r.durationMs, 0);
  const passed = flowResults.filter((r) => r.success).length;

  // Find first PR artifact
  const prUrl = flowResults
    .flatMap((r) => r.artifacts ?? [])
    .find((a) => a.includes('pull')) ?? 'none';

  return {
    issueNum: classified.issue.number,
    title: classified.issue.title,
    repo: classified.issue.html_url.split('/issues/')[0] ?? classified.issue.html_url,
    verdict: verifyVerdict ?? 'N/A',
    prUrl,
    durationFormatted: formatDuration(totalMs),
    phasesPassed: passed,
    phasesTotal: flowResults.length,
  };
}

function buildSlackPrompt(classified: ClassifiedIssue, s: SlackSummary): string {
  return `Send a Slack report for completed issue.

Issue: #${s.issueNum} — ${s.title}
Repo: ${s.repo}
Verdict: ${s.verdict}
PR: ${s.prUrl}
Duration: ${s.durationFormatted}
Phases: ${s.phasesPassed}/${s.phasesTotal} passed

Use the /slack-report skill to send this to the team channel.
Keep the message concise — 2-3 lines max.`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
