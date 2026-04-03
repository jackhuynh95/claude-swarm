import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClassifiedIssue, PhaseResult, RouteFlags, ModelOverrides, PhaseModelConfig } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges } from './branch-manager.js';
import { createDefaultBudgetGuard } from './budget-guard.js';
import { createHistory } from './conversation-history.js';
import { shouldSkipComment } from './comment-guard.js';

const execFileAsync = promisify(execFile);

export interface DebugFlowConfig {
  repo: string;
  maxCycles: number;
  autoMode: boolean;
  configModels?: Record<string, PhaseModelConfig>;
  cliOverrides?: ModelOverrides;
  cwd?: string;
}

const MAX_BUILD_RETRIES = 3;

/**
 * Maps RouteFlags to a /ck:fix CLI flag. Priority order: first match wins.
 */
function buildFixFlags(flags: RouteFlags): string {
  if (flags.hardMode) return '--hard';
  if (flags.securityScan) return '--security';
  if (flags.parallelBugs) return '--parallel';
  if (flags.ciFailure) return '--ci';
  if (flags.designReview) return '--ui';
  if (flags.hasLogs) return '--logs';
  if (flags.quickFix) return '--quick';
  return '--auto';
}

function buildFixPrompt(
  issue: { number: number; title: string; body: string | null },
  fixFlag: string,
  failureContext: string,
  cycle: number,
): string {
  let prompt = `/ck:fix ${fixFlag} Fix #${issue.number}: ${issue.title}\n\n${issue.body ?? '(no body)'}`;
  if (cycle > 0 && failureContext) {
    prompt += `\n\n--- Previous fix attempt (cycle ${cycle}) ---\n${failureContext}`;
  }
  return prompt;
}

async function checkBuild(cwd?: string): Promise<boolean> {
  try {
    await execFileAsync('npm', ['run', 'build'], { cwd: cwd ?? process.cwd() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute the debug flow: single /ck:fix call per cycle with smart flag routing.
 * /ck:fix is a superset of the old debug+fix+test — includes scout, diagnose, assess, fix, verify, prevent.
 */
export async function executeDebugFlow(
  classified: ClassifiedIssue,
  config: DebugFlowConfig,
): Promise<PhaseResult[]> {
  const { issue } = classified;
  const results: PhaseResult[] = [];
  const cwd = config.cwd;
  const budget = createDefaultBudgetGuard(cwd);
  const history = createHistory(cwd);

  // 1. Create feature branch
  await createBranch(issue, 'bug', cwd);

  // 2. Determine fix flags from issue classification
  const fixFlag = buildFixFlags(classified.flags);

  // 3. Fix loop — single /ck:fix call per cycle
  let fixSucceeded = false;

  for (let cycle = 0; cycle < config.maxCycles; cycle++) {
    // Budget check before each cycle
    const budgetCheck = budget.checkBudget(issue.number);
    if (!budgetCheck.allowed) {
      await addComment(config.repo, issue.number, `Budget exceeded: ${budgetCheck.reason}. Stopping debug flow.`);
      await transitionLabel(config.repo, issue.number, undefined, 'error');
      return results;
    }

    // Build fix prompt with failure context from previous cycle
    const lastOutput = history.getLastPhaseOutput(issue.number, 'fix');
    const failureContext = lastOutput?.output ?? '';
    const fixPrompt = buildFixPrompt(issue, fixFlag, failureContext, cycle);

    // Single /ck:fix call (includes scout+diagnose+assess+fix+verify+prevent)
    const fixResult = await invokeClaudePhase(
      fixPrompt, 'fix', config.configModels, config.cliOverrides, config.autoMode, cwd,
    );
    results.push(fixResult);
    budget.recordInvocation(issue.number, fixResult);
    history.recordPhaseOutput(issue.number, 'fix', fixResult);

    if (!fixResult.success) continue;

    // Build check with retry
    let buildOk = false;
    for (let buildAttempt = 0; buildAttempt < MAX_BUILD_RETRIES; buildAttempt++) {
      buildOk = await checkBuild(cwd);
      if (buildOk) break;

      if (buildAttempt < MAX_BUILD_RETRIES - 1) {
        const retryPrompt = `/ck:fix --auto Fix build errors from previous attempt. Original issue #${issue.number}: ${issue.title}`;
        const retryResult = await invokeClaudePhase(
          retryPrompt, 'fix', config.configModels, config.cliOverrides, config.autoMode, cwd,
        );
        results.push(retryResult);
        budget.recordInvocation(issue.number, retryResult);
        history.recordPhaseOutput(issue.number, 'fix', retryResult);
      }
    }

    if (buildOk) {
      fixSucceeded = true;
      break;
    }

    // Mid-loop problem-solving fallback (at halfway point)
    if (cycle === Math.floor(config.maxCycles / 2)) {
      const psCheck = budget.checkBudget(issue.number);
      if (psCheck.allowed) {
        const psPrompt = `/ck:problem-solving when-stuck Stuck fixing #${issue.number}: ${issue.title}. ` +
          `${config.maxCycles - cycle - 1} retries left. Last output:\n${fixResult.output ?? '(none)'}`;
        const psResult = await invokeClaudePhase(
          psPrompt, 'debug', config.configModels, config.cliOverrides, config.autoMode, cwd,
        );
        results.push(psResult);
        budget.recordInvocation(issue.number, psResult);
        history.recordPhaseOutput(issue.number, 'debug', psResult);
      }
    }
  }

  // 4. Post-exhaust: /ck:problem-solving if all retries failed
  if (!fixSucceeded) {
    const psCheck = budget.checkBudget(issue.number);
    if (psCheck.allowed) {
      const lastFix = history.getLastPhaseOutput(issue.number, 'fix');
      const psPrompt = `/ck:problem-solving when-stuck All ${config.maxCycles} fix cycles exhausted for #${issue.number}: ${issue.title}. ` +
        `Last output:\n${lastFix?.output ?? '(none)'}`;
      const psResult = await invokeClaudePhase(
        psPrompt, 'debug', config.configModels, config.cliOverrides, config.autoMode, cwd,
      );
      results.push(psResult);
      budget.recordInvocation(issue.number, psResult);
    }
  }

  // 5. Post-loop: commit, label transition
  if (fixSucceeded) {
    await commitChanges(issue.number, issue.title, 'bug', cwd);
    await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');
  } else {
    await transitionLabel(config.repo, issue.number, undefined, 'needs_refix');
  }

  const summary = fixSucceeded
    ? `Fix applied and build passing via \`/ck:fix ${fixFlag}\`.`
    : `Fix attempted (${config.maxCycles} cycles) with \`/ck:fix ${fixFlag}\`. Still failing. Marked needs_refix.`;

  const guard = await shouldSkipComment(config.repo, issue.number);
  if (guard.skip) {
    console.log(`[debug-flow] Skipping summary comment: ${guard.reason}`);
  } else {
    await addComment(config.repo, issue.number, summary);
  }

  return results;
}
