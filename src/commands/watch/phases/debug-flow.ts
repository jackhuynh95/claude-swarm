import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';
import { createBranch, commitChanges, createPullRequest } from './branch-manager.js';

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

  // 1. Create feature branch
  const branch = await createBranch(issue, 'bug', cwd);

  // 2. Debug-Fix-Test loop
  let testPassed = false;
  let failureContext = '';

  for (let cycle = 0; cycle < config.maxCycles; cycle++) {
    // --- Debug phase (opus, read-only analysis) ---
    const debugPrompt = buildDebugPrompt(issue, failureContext, cycle);
    const debugResult = await invokeClaudePhase(
      debugPrompt, 'debug', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(debugResult);
    if (!debugResult.success) break;

    const debugAnalysis = debugResult.output ?? '';

    // --- Fix phase (sonnet, apply changes) ---
    const fixPrompt = buildFixPrompt(issue, debugAnalysis);
    let fixResult = await invokeClaudePhase(
      fixPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(fixResult);

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
      }
    }

    // --- Test phase (sonnet, verify) ---
    const testPrompt = `/test Verify fix for #${issue.number}: ${issue.title}`;
    const testResult = await invokeClaudePhase(
      testPrompt, 'test', undefined, config.autoMode, cwd,
    );
    results.push(testResult);

    if (didTestsPass(testResult.output ?? '')) {
      testPassed = true;
      break;
    }

    // Feed failure context into next cycle
    failureContext = testResult.output ?? testResult.error ?? 'Tests failed (no output)';
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
  await addComment(config.repo, issue.number, summary);

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
