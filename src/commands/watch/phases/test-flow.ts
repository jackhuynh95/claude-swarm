import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { addComment } from './label-manager.js';
import { executeE2e, parseE2eScenariosFromBody } from './e2e-runner.js';

export interface TestFlowConfig {
  repo: string;
  autoMode: boolean;
  baseUrl?: string;   // for E2E (passed to e2e-runner)
  cwd?: string;
}

export interface TestFlowResult {
  greenPass: boolean;
  results: PhaseResult[];
}

// Result parsing patterns (aligned with e2e-runner)
const PASS_PATTERN = /all.*pass|tests.*pass|0 failed|no.*error/i;
const FAIL_PATTERN = /fail|error|crash|timeout/i;
const TEST_RESULT_PATTERN = /TEST_RESULT:\s*(PASS|FAIL)\s*[—\-]\s*(.+)/i;
const UI_TEST_RESULT_PATTERN = /UI_TEST_RESULT:\s*(PASS|FAIL)\s*[—\-]\s*(.+)/i;

function parseTestResult(output: string): boolean {
  const match = output.match(TEST_RESULT_PATTERN);
  if (match) return match[1].toUpperCase() === 'PASS';
  if (PASS_PATTERN.test(output)) return true;
  if (FAIL_PATTERN.test(output)) return false;
  return true;
}

function parseUiTestResult(output: string): boolean {
  const match = output.match(UI_TEST_RESULT_PATTERN);
  if (match) return match[1].toUpperCase() === 'PASS';
  if (PASS_PATTERN.test(output)) return true;
  if (FAIL_PATTERN.test(output)) return false;
  return true;
}

function buildScenarioPrompt(issue: { number: number; title: string; body: string | null }): string {
  return `/ck:scenario Generate BDD/Gherkin test scenarios for issue #${issue.number}: ${issue.title}

Issue description:
${issue.body ?? '(no body)'}

Generate comprehensive test scenarios covering:
- Happy path
- Edge cases
- Error scenarios
Report as structured Gherkin features.`;
}

function buildTestPrompt(issue: { number: number; title: string; body: string | null }): string {
  return `/ck:test Run unit and integration tests for issue #${issue.number}: ${issue.title}

Verify the implementation satisfies:
${issue.body ?? '(no body)'}

Run the project's test suite. Report results as:
TEST_RESULT: PASS — [summary]
or
TEST_RESULT: FAIL — [what failed]`;
}

function buildUiTestPrompt(issue: { number: number; title: string }): string {
  return `/ck:test --ui Run visual UI tests for issue #${issue.number}: ${issue.title}

Check for:
- Visual regressions
- Layout consistency
- Responsive design issues
- Accessibility violations

Report results as:
UI_TEST_RESULT: PASS — [summary]
or
UI_TEST_RESULT: FAIL — [what failed]`;
}

function buildGreenTestComment(
  issueNum: number,
  greenPass: boolean,
  scenarioStatus: string,
  testStatus: string,
  uiStatus: string,
  e2eStatus: string,
): string {
  const icon = greenPass ? '✅' : '❌';
  const status = greenPass ? 'PASS' : 'FAIL';
  return `<!-- claude-swarm:green-test -->
${icon} **Green Test Result for #${issueNum}: ${status}**

| Phase | Result |
|-------|--------|
| Scenario | ${scenarioStatus} |
| Unit + Integration | ${testStatus} |
| UI Tests | ${uiStatus} |
| E2E Tests | ${e2eStatus} |`;
}

/**
 * Green testing pipeline for the watch daemon.
 * Sequential: scenario (advisory) → unit/integration (fail-fast) → ui (advisory, conditional) → e2e (fail-fast, conditional).
 */
export async function executeTestFlow(
  classified: ClassifiedIssue,
  config: TestFlowConfig,
): Promise<TestFlowResult> {
  const { issue } = classified;
  const results: PhaseResult[] = [];

  let scenarioStatus = 'skipped';
  let testStatus = 'skipped';
  let uiStatus = 'skipped';
  let e2eStatus = 'skipped';

  // 1. /ck:scenario — advisory, skip if no body
  if (issue.body) {
    const scenarioResult = await invokeClaudePhase(
      buildScenarioPrompt(issue), 'scenario', classified.modelOverride, config.autoMode, config.cwd,
    );
    results.push(scenarioResult);
    scenarioStatus = 'generated';
  }

  // 2. /ck:test — unit + integration, FAIL blocks pipeline
  const testResult = await invokeClaudePhase(
    buildTestPrompt(issue), 'test', classified.modelOverride, config.autoMode, config.cwd,
  );
  results.push(testResult);
  const testPassed = testResult.success && parseTestResult(testResult.output ?? '');
  testStatus = testPassed ? 'PASS' : 'FAIL';

  if (!testPassed) {
    await addComment(config.repo, issue.number,
      buildGreenTestComment(issue.number, false, scenarioStatus, testStatus, uiStatus, e2eStatus));
    return { greenPass: false, results };
  }

  // 3. /ck:test --ui — advisory, only for frontend/ui labels
  if (classified.flags.designReview) {
    const uiResult = await invokeClaudePhase(
      buildUiTestPrompt(issue), 'ui_test', classified.modelOverride, config.autoMode, config.cwd,
    );
    results.push(uiResult);
    uiStatus = parseUiTestResult(uiResult.output ?? '') ? 'PASS' : 'FAIL';
  }

  // 4. /ck:test --e2e — delegate to e2e-runner, FAIL blocks pipeline
  const hasE2eScenarios = parseE2eScenariosFromBody(issue.body).length > 0;
  if (hasE2eScenarios || config.baseUrl) {
    const e2eResult = await executeE2e(classified, {
      repo: config.repo,
      autoMode: config.autoMode,
      baseUrl: config.baseUrl,
      cwd: config.cwd,
    });
    results.push(e2eResult.phaseResult);
    e2eStatus = e2eResult.skipped ? 'skipped' : (e2eResult.passed ? 'PASS' : 'FAIL');

    if (!e2eResult.passed && !e2eResult.skipped) {
      await addComment(config.repo, issue.number,
        buildGreenTestComment(issue.number, false, scenarioStatus, testStatus, uiStatus, e2eStatus));
      return { greenPass: false, results };
    }
  }

  // 5. Post green test summary
  await addComment(config.repo, issue.number,
    buildGreenTestComment(issue.number, true, scenarioStatus, testStatus, uiStatus, e2eStatus));

  return { greenPass: true, results };
}
