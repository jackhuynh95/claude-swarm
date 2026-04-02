import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges, createPullRequest } from './branch-manager.js';
import { BudgetGuard, createDefaultBudgetGuard } from './budget-guard.js';
import { ConversationHistory, createHistory } from './conversation-history.js';
import { shouldSkipComment } from './comment-guard.js';

const execFileAsync = promisify(execFile);

export interface DebugFlowConfig {
  repo: string;
  maxCycles: number;
  autoMode: boolean;
  cwd?: string;
}

const MAX_BUILD_RETRIES = 3;

/**
 * Execute the debug flow: /debug -> /fix -> /test with retry loop.
 * Max cycles configurable (default 3). Each cycle feeds failure context forward.
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
  const branch = await createBranch(issue, 'bug', cwd);

  // 2. Debug-Fix-Test loop
  let testPassed = false;

  for (let cycle = 0; cycle < config.maxCycles; cycle++) {
    // --- Budget check before each cycle ---
    const budgetCheck = budget.checkBudget(issue.number);
    if (!budgetCheck.allowed) {
      await addComment(config.repo, issue.number, `Budget exceeded: ${budgetCheck.reason}. Stopping debug flow.`);
      await transitionLabel(config.repo, issue.number, undefined, 'error');
      return results;
    }

    // Use persisted history for failure context (survives restarts)
    const lastTest = history.getLastPhaseOutput(issue.number, 'test');
    const failureContext = lastTest?.output ?? '';

    // --- Debug phase (opus, read-only analysis) ---
    const debugPrompt = buildDebugPrompt(issue, failureContext, cycle);
    const debugResult = await invokeClaudePhase(
      debugPrompt, 'debug', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(debugResult);
    budget.recordInvocation(issue.number, debugResult);
    history.recordPhaseOutput(issue.number, 'debug', debugResult);
    if (!debugResult.success) break;

    const debugAnalysis = debugResult.output ?? '';

    // --- Fix phase (sonnet, apply changes) ---
    const fixPrompt = buildFixPrompt(issue, debugAnalysis);
    let fixResult = await invokeClaudePhase(
      fixPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(fixResult);
    budget.recordInvocation(issue.number, fixResult);
    history.recordPhaseOutput(issue.number, 'fix', fixResult);

    // Build check with retry
    for (let buildAttempt = 0; buildAttempt < MAX_BUILD_RETRIES; buildAttempt++) {
      const buildOk = await checkBuild(cwd);
      if (buildOk) break;

      if (buildAttempt < MAX_BUILD_RETRIES - 1) {
        const retryPrompt = `/fix Fix build errors from previous attempt. Original issue #${issue.number}: ${issue.title}`;
        fixResult = await invokeClaudePhase(
          retryPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
        );
        results.push(fixResult);
        budget.recordInvocation(issue.number, fixResult);
        history.recordPhaseOutput(issue.number, 'fix', fixResult);
      }
    }

    // --- Test phase (sonnet, verify) ---
    const testPrompt = `/test Verify fix for #${issue.number}: ${issue.title}`;
    const testResult = await invokeClaudePhase(
      testPrompt, 'test', undefined, config.autoMode, cwd,
    );
    results.push(testResult);
    budget.recordInvocation(issue.number, testResult);
    history.recordPhaseOutput(issue.number, 'test', testResult);

    if (didTestsPass(testResult.output ?? '')) {
      testPassed = true;
      break;
    }

    // When stuck after half the cycles, invoke /ck:problem-solving for fresh approach
    if (cycle === Math.floor(config.maxCycles / 2)) {
      const problemSolveCheck = budget.checkBudget(issue.number);
      if (problemSolveCheck.allowed) {
        const psPrompt = `/ck:problem-solving when-stuck Stuck debugging #${issue.number}: ${issue.title}. ` +
          `${config.maxCycles - cycle} retries left. Last test output:\n${testResult.output ?? '(none)'}`;
        const psResult = await invokeClaudePhase(
          psPrompt, 'debug', classified.modelOverride, config.autoMode, cwd,
        );
        results.push(psResult);
        budget.recordInvocation(issue.number, psResult);
        history.recordPhaseOutput(issue.number, 'debug', psResult);
      }
    }
  }

  // 3. Post-loop: commit, PR, label transition
  let prUrl: string | undefined;
  if (testPassed) {
    await commitChanges(issue.number, issue.title, 'bug', cwd);
    prUrl = await createPullRequest(
      config.repo, issue.number, issue.title, 'bug', branch, cwd,
    );
    await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');
  } else {
    await transitionLabel(config.repo, issue.number, undefined, 'needs_refix');
  }

  const summary = testPassed
    ? `Fix applied and tests passing. PR: ${prUrl ?? 'N/A'}`
    : `Fix attempted (${config.maxCycles} cycles). Tests still failing. Marked needs_refix.`;

  // Comment guard: skip if bot already commented last or maintainer closed discussion
  const guard = await shouldSkipComment(config.repo, issue.number);
  if (guard.skip) {
    console.log(`[debug-flow] Skipping summary comment: ${guard.reason}`);
  } else {
    await addComment(config.repo, issue.number, summary);
  }

  if (prUrl) {
    results[results.length - 1].artifacts = [prUrl];
  }

  return results;
}

// --- Helpers ---

function buildDebugPrompt(issue: { number: number; title: string; body: string | null }, failureContext: string, cycle: number): string {
  let prompt = `Investigate root cause of #${issue.number}: ${issue.title}\n\n${issue.body ?? '(no body)'}`;
  if (cycle > 0 && failureContext) {
    prompt += `\n\n--- Previous test failure (cycle ${cycle}) ---\n${failureContext}`;
  }
  prompt += '\n\nAnalyze only. Do not implement fixes.';
  return prompt;
}

function buildFixPrompt(issue: { number: number; title: string; body: string | null }, debugAnalysis: string): string {
  return `/fix Fix based on debug analysis for #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}\n\n--- Debug Analysis ---\n${debugAnalysis}`;
}

/**
 * Simple heuristic to detect test pass/fail from output.
 * Ported from fix-issue.sh:417-428.
 */
function didTestsPass(output: string): boolean {
  const lower = output.toLowerCase();
  if (/all.*pass|tests.*pass|0 failed/.test(lower)) return true;
  if (/fail|error/.test(lower)) return false;
  return false; // inconclusive = assume failure, retry
}

async function checkBuild(cwd?: string): Promise<boolean> {
  try {
    await execFileAsync('npm', ['run', 'build'], { cwd: cwd ?? process.cwd() });
    return true;
  } catch {
    return false;
  }
}
