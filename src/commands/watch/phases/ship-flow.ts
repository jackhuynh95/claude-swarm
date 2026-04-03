import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges } from './branch-manager.js';
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
}

/**
 * Detect vague issue specs that benefit from brainstorm clarification.
 * Vague = short body OR no acceptance criteria markers.
 */
function isVagueSpec(issue: { body: string | null }): boolean {
  const body = issue.body ?? '';
  if (body.length < 100) return true;
  const hasCriteria = /accept|criteria|require|must|should|expect|given|when|then/i.test(body);
  return !hasCriteria;
}

/**
 * Execute the ship flow: optional brainstorm → plan → (red-team + validate if hard) →
 * cook → scout → code-review → commit.
 * Ship-flow ends at commitChanges(). PR is created later by /ck:ship in post-ship verify gate.
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
  await createBranch(issue, issueType, cwd);

  // 2. Budget check before plan
  const planBudgetCheck = budget.checkBudget(issue.number);
  if (!planBudgetCheck.allowed) {
    await addComment(config.repo, issue.number, `Budget exceeded: ${planBudgetCheck.reason}. Stopping ship flow.`);
    await transitionLabel(config.repo, issue.number, undefined, 'error');
    return results;
  }

  // 3. Vault context
  const vaultContext = config.vaultPath
    ? await loadVaultContext(config.vaultPath, issue)
    : '';

  // 4. Optional brainstorm — only for vague specs
  if (isVagueSpec(issue)) {
    const brainstormPrompt = `/ck:brainstorm Clarify scope for #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
    const brainstormResult = await invokeClaudePhase(
      brainstormPrompt, 'brainstorm', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(brainstormResult);
    budget.recordInvocation(issue.number, brainstormResult);
    history.recordPhaseOutput(issue.number, 'brainstorm', brainstormResult);
  }

  // 5. Plan phase — hard flag selects --hard, else --fast
  const planFlag = classified.flags.hardMode ? '--hard' : '--fast';
  const planPrompt = buildPlanPrompt(issue, vaultContext, planFlag);
  const planResult = await invokeClaudePhase(
    planPrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(planResult);
  budget.recordInvocation(issue.number, planResult);
  history.recordPhaseOutput(issue.number, 'plan', planResult);

  // 6. Red-team — only for hard issues
  if (classified.flags.hardMode) {
    const redTeamPrompt = `/ck:plan red-team Review plan for #${issue.number}: ${issue.title}. Think like an attacker — find gaps, missing edge cases, security oversights.`;
    const redTeamResult = await invokeClaudePhase(
      redTeamPrompt, 'plan_redteam', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(redTeamResult);
    budget.recordInvocation(issue.number, redTeamResult);
    history.recordPhaseOutput(issue.number, 'plan_redteam', redTeamResult);
  }

  // 7. Validate — only for hard issues
  if (classified.flags.hardMode) {
    const validatePrompt = `/ck:plan validate Validate plan for #${issue.number}: ${issue.title}. Check for completeness, feasibility, and alignment with project conventions.`;
    const validateResult = await invokeClaudePhase(
      validatePrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(validateResult);
    budget.recordInvocation(issue.number, validateResult);
    history.recordPhaseOutput(issue.number, 'plan', validateResult);
  }

  // 8. Fail-check on plan result
  if (!planResult.success) {
    await addComment(config.repo, issue.number, `Planning phase failed for #${issue.number}. Error: ${planResult.error ?? 'unknown'}`);
    return results;
  }

  // 9. Budget check before cook
  const cookBudgetCheck = budget.checkBudget(issue.number);
  if (!cookBudgetCheck.allowed) {
    await addComment(config.repo, issue.number, `Budget exceeded: ${cookBudgetCheck.reason}. Stopping after plan.`);
    await transitionLabel(config.repo, issue.number, undefined, 'error');
    return results;
  }

  // 10. Cook — implementation
  const cookFlags = config.noTest ? '--auto --no-test' : '--auto';
  const cookPrompt = `/ck:cook ${cookFlags} Implement GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  const cookResult = await invokeClaudePhase(
    cookPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(cookResult);
  budget.recordInvocation(issue.number, cookResult);
  history.recordPhaseOutput(issue.number, 'fix', cookResult);

  // 11. Scout — edge case discovery
  const scoutPrompt = `/ck:scout Scan implementation for #${issue.number}: ${issue.title}. Find edge cases, missing validations, untested paths.`;
  const scoutResult = await invokeClaudePhase(
    scoutPrompt, 'scout', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(scoutResult);
  budget.recordInvocation(issue.number, scoutResult);

  // 12. Code review — quality check
  const reviewPrompt = `/ck:code-review Review implementation for #${issue.number}: ${issue.title}. Check quality, patterns, maintainability.`;
  const reviewResult = await invokeClaudePhase(
    reviewPrompt, 'code_review', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(reviewResult);
  budget.recordInvocation(issue.number, reviewResult);

  // 13. Commit — FINAL step, no PR
  const committed = await commitChanges(issue.number, issue.title, issueType, cwd);

  // 14. Label transition
  await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');

  // 15. Summary comment (no PR URL)
  const summary = committed
    ? `Implementation complete for #${issue.number}. Awaiting post-ship verification.`
    : `No changes detected for #${issue.number}.`;

  const guard = await shouldSkipComment(config.repo, issue.number);
  if (guard.skip) {
    console.log(`[ship-flow] Skipping summary comment: ${guard.reason}`);
  } else {
    await addComment(config.repo, issue.number, summary);
  }

  return results;
}

function buildPlanPrompt(
  issue: { number: number; title: string; body: string | null },
  vaultContext: string,
  planFlag: string,
): string {
  const contextSection = vaultContext ? `\n\n${vaultContext}\n` : '';
  return `/ck:plan ${planFlag} Implement GitHub issue #${issue.number}:\n\n${issue.title}\n\n${issue.body ?? ''}${contextSection}\nCreate implementation plan following project conventions.`;
}
