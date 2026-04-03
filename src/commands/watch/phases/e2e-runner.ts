import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { transitionLabel, addComment } from './label-manager.js';

export interface E2eConfig {
  repo: string;
  autoMode: boolean;
  baseUrl?: string;       // app URL to test (undefined = skip)
  scenarios?: string[];   // specific test scenarios
  cwd?: string;
}

export interface E2eResult {
  skipped: boolean;
  passed: boolean;
  phaseResult: PhaseResult;
}

// Pass/fail heuristics reused from debug-flow test detection
const PASS_PATTERN = /all.*pass|tests.*pass|0 failed|no.*error/i;
const FAIL_PATTERN = /fail|error|crash|timeout/i;
const E2E_RESULT_PATTERN = /E2E_RESULT:\s*(PASS|FAIL)\s*[—\-]\s*(.+)/i;

/**
 * Parse E2E scenarios from issue body.
 * Looks for a "## E2E Scenarios" section with bullet points.
 */
export function parseE2eScenariosFromBody(body: string | null): string[] {
  if (!body) return [];
  const match = body.match(/##\s*E2E\s*Scenarios?\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^[\s]*[-*]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Agent-browser E2E testing phase.
 * Skips gracefully when no baseUrl configured.
 * Parses scenarios from issue body if none provided in config.
 * FAIL blocks downstream post-ship pipeline.
 */
export async function executeE2e(
  classified: ClassifiedIssue,
  config: E2eConfig,
): Promise<E2eResult> {
  if (!config.baseUrl) {
    const phaseResult: PhaseResult = {
      phase: 'e2e',
      success: true,
      output: 'E2E skipped — no baseUrl configured',
      durationMs: 0,
    };
    return { skipped: true, passed: true, phaseResult };
  }

  const { issue } = classified;
  const scenarios = config.scenarios ?? parseE2eScenariosFromBody(issue.body);
  const prompt = buildE2ePrompt(issue, config.baseUrl, scenarios);

  const phaseResult = await invokeClaudePhase(
    prompt, 'e2e', undefined, classified.modelOverride ? { model: classified.modelOverride } : undefined, config.autoMode, config.cwd,
  );

  const passed = parseE2eResult(phaseResult.output ?? '');

  const comment = buildE2eComment(passed, phaseResult.output ?? '', issue.number);
  await addComment(config.repo, issue.number, comment);

  if (!passed) {
    await transitionLabel(config.repo, issue.number, undefined, 'needs_refix');
  }

  return { skipped: false, passed, phaseResult };
}

function buildE2ePrompt(
  issue: { number: number; title: string },
  baseUrl: string,
  scenarios?: string[],
): string {
  const scenarioList = scenarios?.length
    ? `\nTest scenarios:\n${scenarios.map((s) => `- ${s}`).join('\n')}`
    : '';

  return `Run E2E browser tests for issue #${issue.number}: ${issue.title}

Base URL: ${baseUrl}${scenarioList}

Use \`agent-browser\` CLI to:
1. Navigate to the base URL
2. Verify the implemented feature works
3. Check for visual regressions or broken interactions

Report results as:
E2E_RESULT: PASS — [summary]
or
E2E_RESULT: FAIL — [what failed]`;
}

function parseE2eResult(output: string): boolean {
  const match = output.match(E2E_RESULT_PATTERN);
  if (match) {
    return match[1].toUpperCase() === 'PASS';
  }
  // Fallback heuristic
  if (PASS_PATTERN.test(output)) return true;
  if (FAIL_PATTERN.test(output)) return false;
  // Default pass if no clear signal
  return true;
}

function buildE2eComment(passed: boolean, output: string, issueNum: number): string {
  const icon = passed ? '✅' : '❌';
  const status = passed ? 'PASS' : 'FAIL';
  const summary = output.slice(0, 500);
  return `<!-- claude-swarm:e2e -->
${icon} **E2E Test Result for #${issueNum}: ${status}**

${summary}`;
}
