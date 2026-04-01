import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges, createPullRequest } from './branch-manager.js';

export interface ShipFlowConfig {
  repo: string;
  autoMode: boolean;
  noTest: boolean;
  cwd?: string;
}

/**
 * Execute the ship flow: /plan:fast -> /ck:cook --auto -> commit -> PR.
 * For docs/chore issues, uses --no-test to skip tests.
 */
export async function executeShipFlow(
  classified: ClassifiedIssue,
  config: ShipFlowConfig,
): Promise<PhaseResult[]> {
  const { issue, issueType } = classified;
  const results: PhaseResult[] = [];
  const cwd = config.cwd;

  // 1. Create feature branch
  const branch = await createBranch(issue, issueType, cwd);

  // 2. Plan phase (opus)
  const planPrompt = buildPlanPrompt(issue);
  const planResult = await invokeClaudePhase(
    planPrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(planResult);

  if (!planResult.success) {
    await addComment(config.repo, issue.number, `Planning phase failed for #${issue.number}. Error: ${planResult.error ?? 'unknown'}`);
    return results;
  }

  // 3. Implementation phase (sonnet)
  const cookFlags = config.noTest ? '--auto --no-test' : '--auto';
  const cookPrompt = `/ck:cook ${cookFlags} Implement GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  const cookResult = await invokeClaudePhase(
    cookPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(cookResult);

  // 4. Post-implementation: commit, PR, label transition
  await commitChanges(issue.number, issue.title, issueType, cwd);
  const prUrl = await createPullRequest(
    config.repo, issue.number, issue.title, issueType, branch, cwd,
  );

  await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');

  const summary = prUrl
    ? `Implementation complete. PR: ${prUrl}`
    : `Implementation complete but PR creation failed for #${issue.number}.`;
  await addComment(config.repo, issue.number, summary);

  if (prUrl) {
    results[results.length - 1].artifacts = [prUrl];
  }

  return results;
}

function buildPlanPrompt(issue: { number: number; title: string; body: string | null }): string {
  return `/plan:fast Implement GitHub issue #${issue.number}:\n\n${issue.title}\n\n${issue.body ?? ''}\n\nCreate implementation plan following project conventions.`;
}
