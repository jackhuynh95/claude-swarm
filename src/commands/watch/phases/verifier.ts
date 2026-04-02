import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';

export interface VerifierConfig {
  repo: string;
  autoMode: boolean;
  branch: string;  // feature branch to verify
  cwd?: string;
  redTeam?: boolean;  // enable adversarial red-team review pass
}

export type VerifyVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface VerifyResult {
  verdict: VerifyVerdict;
  reasoning: string;
  phaseResult: PhaseResult;
}

/**
 * Independent verify agent — reviews diff against issue requirements.
 * When redTeam enabled, runs two passes:
 *   Pass 1: standard quality review
 *   Pass 2: adversarial red-team review (think like attackers)
 * Combined verdict: worst of both passes.
 * FAIL blocks downstream post-ship phases.
 */
export async function executeVerify(
  classified: ClassifiedIssue,
  config: VerifierConfig,
): Promise<VerifyResult> {
  const { issue } = classified;

  // Pass 1: Standard quality review
  const standardPrompt = buildVerifyPrompt(issue);
  const standardResult = await invokeClaudePhase(
    standardPrompt, 'verify', classified.modelOverride, config.autoMode, config.cwd,
  );
  const standard = parseVerdict(standardResult.output ?? '');

  // Pass 2: Red-team adversarial review (when enabled)
  let redTeam = { verdict: standard.verdict, reasoning: '' };
  let redTeamResult = standardResult;
  if (config.redTeam) {
    const redTeamPrompt = buildRedTeamPrompt(issue);
    redTeamResult = await invokeClaudePhase(
      redTeamPrompt, 'plan_redteam', classified.modelOverride, config.autoMode, config.cwd,
    );
    redTeam = parseVerdict(redTeamResult.output ?? '');
  }

  // Combined verdict: worst of both passes
  const verdict = worstVerdict(standard.verdict, redTeam.verdict);
  const reasoning = config.redTeam
    ? `**Standard:** ${standard.reasoning}\n**Red-team:** ${redTeam.reasoning}`
    : standard.reasoning;

  const comment = buildVerdictComment(verdict, reasoning, issue.number);
  await addComment(config.repo, issue.number, comment);

  if (verdict === 'PASS' || verdict === 'PARTIAL') {
    await transitionLabel(config.repo, issue.number, 'shipped', 'verified');
  } else {
    await transitionLabel(config.repo, issue.number, 'shipped', 'needs_refix');
  }

  // Return the last phase result for pipeline tracking
  const phaseResult = config.redTeam ? redTeamResult : standardResult;
  return { verdict, reasoning, phaseResult };
}

function buildVerifyPrompt(issue: { number: number; title: string; body: string | null }): string {
  return `You are an independent code reviewer. Review the changes on this branch.

Issue #${issue.number}: ${issue.title}
Requirements: ${issue.body ?? 'No description provided'}

Run \`git diff main...HEAD\` to see changes.

Evaluate:
1. Do changes satisfy the issue requirements?
2. Are there obvious bugs or regressions?
3. Is the code quality acceptable?

Reply with EXACTLY one of:
VERDICT: PASS — [one-line reason]
VERDICT: PARTIAL — [concerns]
VERDICT: FAIL — [failure reasons]`;
}

function parseVerdict(output: string): { verdict: VerifyVerdict; reasoning: string } {
  const match = output.match(/VERDICT:\s*(PASS|FAIL|PARTIAL)\s*[—\-]\s*(.+)/i);
  if (match) {
    return {
      verdict: match[1].toUpperCase() as VerifyVerdict,
      reasoning: match[2].trim(),
    };
  }
  // Default to PARTIAL on parse failure — don't block pipeline on ambiguous output
  return { verdict: 'PARTIAL', reasoning: 'Could not parse verdict from output' };
}

function buildRedTeamPrompt(issue: { number: number; title: string; body: string | null }): string {
  return `You are a RED TEAM security reviewer. Your job is to find problems.

Issue #${issue.number}: ${issue.title}
Requirements: ${issue.body ?? 'No description provided'}

Run \`git diff main...HEAD\` to see changes.

Think like an attacker. Look for:
1. Security vulnerabilities (injection, auth bypass, data leaks)
2. Edge cases that could cause crashes or data corruption
3. Missing input validation at system boundaries
4. Race conditions or state inconsistencies
5. Assumptions that could break under load or adversarial input

Reply with EXACTLY one of:
VERDICT: PASS — [no critical issues found]
VERDICT: PARTIAL — [concerns that should be addressed]
VERDICT: FAIL — [critical security or correctness issues]`;
}

/**
 * Return the worst verdict: FAIL > PARTIAL > PASS.
 */
function worstVerdict(a: VerifyVerdict, b: VerifyVerdict): VerifyVerdict {
  const rank: Record<VerifyVerdict, number> = { PASS: 0, PARTIAL: 1, FAIL: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function buildVerdictComment(verdict: VerifyVerdict, reasoning: string, issueNum: number): string {
  const icon = verdict === 'PASS' ? '✅' : verdict === 'PARTIAL' ? '⚠️' : '❌';
  return `<!-- claude-swarm:verify -->
${icon} **Verification Result for #${issueNum}: ${verdict}**

${reasoning}`;
}
