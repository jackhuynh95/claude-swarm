import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges, createPullRequest } from './branch-manager.js';
import { createDefaultBudgetGuard } from './budget-guard.js';
import { createHistory } from './conversation-history.js';
import { shouldSkipComment } from './comment-guard.js';
import { loadVaultContext } from './vault-context-loader.js';

export interface ShipFlowConfig {
  repo: string;
  autoMode: boolean;
  noTest: boolean;
  vaultPath?: string;   // obsidian-vault path for planning context
  cwd?: string;
  useTeam?: boolean;    // use /ck:team for parallel agent execution
  targetBranch?: 'official' | 'beta'; // /ck:ship branch targeting
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

  const budget = createDefaultBudgetGuard(cwd);
  const history = createHistory(cwd);

  // 1. Create feature branch
  const branch = await createBranch(issue, issueType, cwd);

  // 2. Plan phase (opus) — budget check first
  const planBudgetCheck = budget.checkBudget(issue.number);
  if (!planBudgetCheck.allowed) {
    await addComment(config.repo, issue.number, `Budget exceeded: ${planBudgetCheck.reason}. Stopping ship flow.`);
    await transitionLabel(config.repo, issue.number, undefined, 'error');
    return results;
  }

  const vaultContext = config.vaultPath
    ? await loadVaultContext(config.vaultPath, issue)
    : '';

  // 2a. Plan phase — use /ck:team for parallel research when enabled
  const planPrompt = config.useTeam
    ? buildTeamPlanPrompt(issue, vaultContext)
    : buildPlanPrompt(issue, vaultContext);
  const planResult = await invokeClaudePhase(
    planPrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(planResult);
  budget.recordInvocation(issue.number, planResult);
  history.recordPhaseOutput(issue.number, 'plan', planResult);

  // 2b. Red-team plan review — adversarial review of the plan
  const redTeamPrompt = `/ck:plan red-team Review plan for #${issue.number}: ${issue.title}. Think like an attacker — find gaps, missing edge cases, security oversights.`;
  const redTeamResult = await invokeClaudePhase(
    redTeamPrompt, 'plan_redteam', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(redTeamResult);
  budget.recordInvocation(issue.number, redTeamResult);
  history.recordPhaseOutput(issue.number, 'plan_redteam', redTeamResult);

  if (!planResult.success) {
    await addComment(config.repo, issue.number, `Planning phase failed for #${issue.number}. Error: ${planResult.error ?? 'unknown'}`);
    return results;
  }

  // 3. Implementation phase — budget check first
  const cookBudgetCheck = budget.checkBudget(issue.number);
  if (!cookBudgetCheck.allowed) {
    await addComment(config.repo, issue.number, `Budget exceeded: ${cookBudgetCheck.reason}. Stopping after plan.`);
    await transitionLabel(config.repo, issue.number, undefined, 'error');
    return results;
  }

  // Use /ck:team for parallel implementation when enabled, else /ck:cook
  const cookFlags = config.noTest ? '--auto --no-test' : '--auto';
  const cookPrompt = config.useTeam
    ? `/ck:team implement --devs 2 --reviewers 1 Implement GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`
    : `/ck:cook ${cookFlags} Implement GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  const cookResult = await invokeClaudePhase(
    cookPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(cookResult);
  budget.recordInvocation(issue.number, cookResult);
  history.recordPhaseOutput(issue.number, 'fix', cookResult);

  // 4. Post-implementation: use /ck:ship for branch lifecycle or manual commit+PR
  const targetFlag = config.targetBranch === 'beta' ? '--beta' : '--official';
  let prUrl: string | undefined;

  if (config.useTeam) {
    // /ck:ship handles commit, push, PR creation in one command
    const shipPrompt = `/ck:ship ${targetFlag} Ship implementation for #${issue.number}: ${issue.title}`;
    const shipResult = await invokeClaudePhase(
      shipPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(shipResult);
    budget.recordInvocation(issue.number, shipResult);
    prUrl = extractPrUrl(shipResult.output ?? '');
  } else {
    // Fallback: manual commit + PR
    await commitChanges(issue.number, issue.title, issueType, cwd);
    prUrl = await createPullRequest(
      config.repo, issue.number, issue.title, issueType, branch, cwd,
    );
  }

  await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');

  const summary = prUrl
    ? `Implementation complete. PR: ${prUrl}`
    : `Implementation complete but PR creation failed for #${issue.number}.`;

  // Comment guard: skip if bot already commented last or maintainer closed discussion
  const guard = await shouldSkipComment(config.repo, issue.number);
  if (guard.skip) {
    console.log(`[ship-flow] Skipping summary comment: ${guard.reason}`);
  } else {
    await addComment(config.repo, issue.number, summary);
  }

  if (prUrl) {
    results[results.length - 1].artifacts = [prUrl];
  }

  return results;
}

function buildPlanPrompt(
  issue: { number: number; title: string; body: string | null },
  vaultContext: string,
): string {
  const contextSection = vaultContext ? `\n\n${vaultContext}\n` : '';
  return `/plan:fast Implement GitHub issue #${issue.number}:\n\n${issue.title}\n\n${issue.body ?? ''}${contextSection}\nCreate implementation plan following project conventions.`;
}

function buildTeamPlanPrompt(
  issue: { number: number; title: string; body: string | null },
  vaultContext: string,
): string {
  const contextSection = vaultContext ? `\n\n${vaultContext}\n` : '';
  return `/ck:team research --researchers 2 Research and plan GitHub issue #${issue.number}:\n\n${issue.title}\n\n${issue.body ?? ''}${contextSection}\nParallel research then synthesize into implementation plan.`;
}

/**
 * Extract PR URL from /ck:ship output.
 * Looks for GitHub PR URL pattern in command output.
 */
function extractPrUrl(output: string): string | undefined {
  const match = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0];
}
