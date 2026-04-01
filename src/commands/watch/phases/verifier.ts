import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';

export interface VerifierConfig {
  repo: string;
  autoMode: boolean;
  branch: string;  // feature branch to verify
  cwd?: string;
}

export type VerifyVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface VerifyResult {
  verdict: VerifyVerdict;
  reasoning: string;
  phaseResult: PhaseResult;
}

/**
 * Independent verify agent — reviews diff against issue requirements.
 * Returns PASS/FAIL/PARTIAL verdict. FAIL blocks downstream post-ship phases.
 */
export async function executeVerify(
  classified: ClassifiedIssue,
  config: VerifierConfig,
): Promise<VerifyResult> {
  const { issue } = classified;
  const prompt = buildVerifyPrompt(issue);

  const phaseResult = await invokeClaudePhase(
    prompt, 'verify', classified.modelOverride, config.autoMode, config.cwd,
  );

  const { verdict, reasoning } = parseVerdict(phaseResult.output ?? '');

  const comment = buildVerdictComment(verdict, reasoning, issue.number);
  await addComment(config.repo, issue.number, comment);

  if (verdict === 'PASS' || verdict === 'PARTIAL') {
    await transitionLabel(config.repo, issue.number, 'shipped', 'verified');
  } else {
    await transitionLabel(config.repo, issue.number, 'shipped', 'needs_refix');
  }

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

function buildVerdictComment(verdict: VerifyVerdict, reasoning: string, issueNum: number): string {
  const icon = verdict === 'PASS' ? '✅' : verdict === 'PARTIAL' ? '⚠️' : '❌';
  return `<!-- claude-swarm:verify -->
${icon} **Verification Result for #${issueNum}: ${verdict}**

${reasoning}`;
}
