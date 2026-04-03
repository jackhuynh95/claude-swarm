import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { executeE2e, type E2eConfig } from './e2e-runner.js';
import { executeDesignReview, type DesignReviewConfig } from './design-reviewer.js';
import { executeSlackReport, type SlackReporterConfig } from './slack-reporter.js';
import { executeJournal, type JournalConfig } from './journal-writer.js';
import { recordRun, type RunRecordConfig } from './run-recorder.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { executeSecurityFlow, type SecurityFlowConfig } from './security-flow.js';
import { createPullRequest } from './branch-manager.js';

export interface PostShipConfig {
  repo: string;
  autoMode: boolean;
  branch: string;
  baseUrl?: string;           // E2E base URL (undefined = skip E2E)
  e2eScenarios?: string[];
  vaultPath: string;          // obsidian-vault path
  cwd?: string;
  redTeam?: boolean;          // kept for config compat, not used in new pipeline
}

export interface PostShipResult {
  results: PhaseResult[];
  verdict: 'PASS' | 'FAIL';
  pipelinePassed: boolean;
  shipPath: 'ck-ship' | 'fallback' | 'none';  // which PR creation path was used
}

// Regex to extract PR URL from /ck:ship output
const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

function buildScoutPrompt(issue: ClassifiedIssue['issue']): string {
  return `/ck:scout Discover edge cases in changes for #${issue.number}: ${issue.title}

Run \`git diff main...HEAD\` to see changes.
Look for: missing error handling, untested paths, boundary conditions, race conditions.`;
}

function buildPredictPrompt(issue: ClassifiedIssue['issue']): string {
  return `/ck:predict Analyze impact of changes for #${issue.number}: ${issue.title}

5 expert personas debate: architect, security engineer, performance engineer, UX designer, ops/SRE.
Each persona evaluates the changes and flags concerns from their perspective.`;
}

function buildShipPrompt(issue: ClassifiedIssue['issue'], branch: string, repo: string): string {
  return `/ck:ship --official Ship changes for #${issue.number}: ${issue.title}

Branch: ${branch}
Repository: ${repo}

Pipeline:
1. Merge latest main
2. Run test suite
3. 2-pass code review (standard + red-team)
4. Bump version + update changelog
5. Push branch
6. Create PR closing #${issue.number}`;
}

function parseShipResult(output: string): { success: boolean; prUrl?: string } {
  const prMatch = output.match(PR_URL_PATTERN);
  return {
    success: prMatch !== null,
    prUrl: prMatch?.[0],
  };
}

/**
 * Orchestrates all post-ship phases:
 * security → e2e → scout → predict → ship (try) → fallback → design-review → slack → journal → llms → record
 *
 * PASS = PR created via /ck:ship or fallback createPullRequest().
 * FAIL = both ship paths failed.
 * E2E FAIL still stops pipeline before ship.
 */
export async function executePostShip(
  classified: ClassifiedIssue,
  config: PostShipConfig,
  flowResults: PhaseResult[],
): Promise<PostShipResult> {
  const results: PhaseResult[] = [];
  const { issue } = classified;

  // 1. Security flow — advisory, never blocks
  if (classified.flags.securityScan) {
    const securityConfig: SecurityFlowConfig = {
      repo: config.repo,
      autoMode: config.autoMode,
      cwd: config.cwd,
    };
    const securityResult = await executeSecurityFlow(classified, securityConfig);
    results.push(...securityResult.results);
  }

  // 2. E2E — FAIL stops pipeline (skips if no baseUrl)
  const e2eConfig: E2eConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    baseUrl: config.baseUrl,
    scenarios: config.e2eScenarios,
    cwd: config.cwd,
  };
  const e2eResult = await executeE2e(classified, e2eConfig);
  results.push(e2eResult.phaseResult);

  if (!e2eResult.skipped && !e2eResult.passed) {
    return { results, verdict: 'FAIL', pipelinePassed: false, shipPath: 'none' };
  }

  // 3. Scout — edge case discovery, always runs, advisory
  const scoutResult = await invokeClaudePhase(
    buildScoutPrompt(issue), 'scout', classified.modelOverride, config.autoMode, config.cwd,
  );
  results.push(scoutResult);

  // 4. Predict — only for hardMode issues (5-persona impact debate)
  if (classified.flags.hardMode) {
    const predictResult = await invokeClaudePhase(
      buildPredictPrompt(issue), 'predict', classified.modelOverride, config.autoMode, config.cwd,
    );
    results.push(predictResult);
  }

  // 5. TRY: /ck:ship --official (replaces verify + createPullRequest)
  let shipPath: PostShipResult['shipPath'] = 'none';
  let verdict: 'PASS' | 'FAIL' = 'FAIL';

  const shipPhaseResult = await invokeClaudePhase(
    buildShipPrompt(issue, config.branch, config.repo),
    'ship',
    classified.modelOverride,
    config.autoMode,
    config.cwd,
  );
  results.push(shipPhaseResult);

  const shipParsed = parseShipResult(shipPhaseResult.output ?? '');
  if (shipParsed.success) {
    verdict = 'PASS';
    shipPath = 'ck-ship';
    if (shipParsed.prUrl) {
      shipPhaseResult.artifacts = [...(shipPhaseResult.artifacts ?? []), shipParsed.prUrl];
    }
    console.log(`[post-ship] shipped via /ck:ship — PR: ${shipParsed.prUrl ?? 'unknown'}`);
  } else {
    // 6. FALLBACK: createPullRequest() from branch-manager.ts
    console.log('[post-ship] /ck:ship failed, falling back to createPullRequest()');
    const prUrl = await createPullRequest(
      config.repo,
      issue.number,
      issue.title,
      classified.issueType,
      config.branch,
      config.cwd,
    );
    if (prUrl) {
      verdict = 'PASS';
      shipPath = 'fallback';
      results.push({
        phase: 'ship',
        success: true,
        output: `Fallback PR created: ${prUrl}`,
        artifacts: [prUrl],
        durationMs: 0,
      });
      console.log(`[post-ship] shipped via fallback — PR: ${prUrl}`);
    } else {
      console.log('[post-ship] both ship paths failed');
    }
  }

  // 7. Design review — advisory only
  const designConfig: DesignReviewConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const designResult = await executeDesignReview(classified, designConfig);
  results.push(designResult.phaseResult);

  // 8. Slack report — best-effort
  const slackConfig: SlackReporterConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const slackResult = await executeSlackReport(
    classified, slackConfig, [...flowResults, ...results], verdict,
  );
  results.push(slackResult);

  // 9. Journal — always runs last
  const journalConfig: JournalConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    vaultPath: config.vaultPath,
    cwd: config.cwd,
  };
  const journalResult = await executeJournal(
    classified, journalConfig, [...flowResults, ...results], verdict,
  );
  results.push(journalResult);

  // 10. AI-native docs generation — best-effort
  const llmsPrompt = `/ck:llms Generate llms.txt for AI-native codebase comprehension after shipping #${issue.number}`;
  const llmsResult = await invokeClaudePhase(
    llmsPrompt, 'docs', classified.modelOverride, config.autoMode, config.cwd,
  );
  results.push(llmsResult);

  // 11. Run recorder — pure file write, best-effort
  const runConfig: RunRecordConfig = { vaultPath: config.vaultPath };
  await recordRun(classified, runConfig, flowResults, results, verdict);

  return { results, verdict, pipelinePassed: verdict === 'PASS', shipPath };
}
