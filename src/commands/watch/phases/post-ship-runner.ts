import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClassifiedIssue, PhaseResult, ModelOverrides, PhaseModelConfig } from '../types.js';
import { executeDesignReview, type DesignReviewConfig } from './design-reviewer.js';
import { executeTestFlow, type TestFlowConfig } from './test-flow.js';
import { executeSlackReport, type SlackReporterConfig } from './slack-reporter.js';
import { executeJournal, type JournalConfig } from './journal-writer.js';
import { recordRun, type RunRecordConfig } from './run-recorder.js';
import { extractKnowledge } from '../../sync/knowledge-extractor.js';
import { acquireCycleLock } from '../../sync/cycle-guard.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { loadVaultContext } from './vault-context-loader.js';
import { executeSecurityFlow, type SecurityFlowConfig } from './security-flow.js';
import { createPullRequest } from './branch-manager.js';

export interface PostShipConfig {
  repo: string;
  autoMode: boolean;
  branch: string;
  baseUrl?: string;           // E2E base URL (undefined = skip E2E)
  e2eScenarios?: string[];
  vaultPath: string;          // obsidian-vault path
  configModels?: Record<string, PhaseModelConfig>;
  cliOverrides?: ModelOverrides;
  cwd?: string;
  redTeam?: boolean;          // kept for config compat, not used in new pipeline
}

export interface PostShipResult {
  results: PhaseResult[];
  verdict: 'PASS' | 'FAIL';
  pipelinePassed: boolean;
  shipPath: 'ck-ship' | 'fallback' | 'none';  // which PR creation path was used
  officialComplete: boolean;  // true when vault trace written (PASS + vault path)
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
 * Lightweight debrief for runs without --vault.
 * Best-effort only — never throws, never blocks.
 */
export async function executeBestEffortDebrief(
  classified: ClassifiedIssue,
  autoMode: boolean,
  vaultPath?: string,
  cwd?: string,
): Promise<void> {
  const { issue, issueType } = classified;

  // Load vault context best-effort — skip cleanly if no vault or load fails
  let vaultSection = '';
  if (vaultPath) {
    try {
      const ctx = await loadVaultContext(vaultPath, { title: issue.title });
      if (ctx) vaultSection = `\n\n${ctx}`;
    } catch { /* swallow */ }
  }

  const prompt = `/ttw:debrief Compare spec vs built for #${issue.number}: ${issue.title}

Type: ${issueType} | Mode: best-effort (no vault)
Check plans/ for spec.md and plan.md. Write debrief.md to plans/reports/.${vaultSection}`;

  try {
    const result = await invokeClaudePhase(prompt, 'debrief', undefined, undefined, autoMode, cwd);
    if (result.artifacts?.length) {
      console.log(`[post-ship] debrief artifact: ${result.artifacts[0]}`);
    }
  } catch {
    // never block
  }
}

/**
 * Check whether required vault-backed trace artifacts exist for the given issue.
 * Requires: run-recorder file AND journal daily file both present in vaultPath.
 * Best-effort — returns false on any fs error rather than throwing.
 */
async function isVaultTracePresent(vaultPath: string, issueNumber: number): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const runFile   = join(vaultPath, 'Runs', `${today}-issue-${issueNumber}.md`);
  const dailyFile = join(vaultPath, 'Daily', `${today}.md`);
  try {
    await Promise.all([access(runFile), access(dailyFile)]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Orchestrates all post-ship phases:
 * test-flow (green) → security-flow (red, if label) → scout → predict → ship (try) → fallback → design-review → slack → journal → llms → record
 *
 * PASS = PR created via /ck:ship or fallback createPullRequest().
 * FAIL = green test-flow fails.
 * Security is advisory — never blocks pipeline.
 */
export async function executePostShip(
  classified: ClassifiedIssue,
  config: PostShipConfig,
  flowResults: PhaseResult[],
): Promise<PostShipResult> {
  const results: PhaseResult[] = [];
  const { issue } = classified;

  // 1. GREEN TESTING — test-flow (scenario → test → ui-test → e2e), FAIL stops pipeline
  const testConfig: TestFlowConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    baseUrl: config.baseUrl,
    cwd: config.cwd,
  };
  const greenResult = await executeTestFlow(classified, testConfig);
  results.push(...greenResult.results);

  if (!greenResult.greenPass) {
    return { results, verdict: 'FAIL', pipelinePassed: false, shipPath: 'none', officialComplete: false };
  }

  // 2. RED TESTING — security-flow (only if GREEN PASS + security label), advisory
  if (classified.flags.securityScan) {
    const securityConfig: SecurityFlowConfig = {
      repo: config.repo,
      autoMode: config.autoMode,
      cwd: config.cwd,
    };
    const securityResult = await executeSecurityFlow(classified, securityConfig);
    results.push(...securityResult.results);
  }

  // 3. Scout — edge case discovery, always runs, advisory
  const scoutResult = await invokeClaudePhase(
    buildScoutPrompt(issue), 'scout', config.configModels, config.cliOverrides, config.autoMode, config.cwd,
  );
  results.push(scoutResult);

  // 4. Predict — only for hardMode issues (5-persona impact debate)
  if (classified.flags.hardMode) {
    const predictResult = await invokeClaudePhase(
      buildPredictPrompt(issue), 'predict', config.configModels, config.cliOverrides, config.autoMode, config.cwd,
    );
    results.push(predictResult);
  }

  // 5. TRY: /ck:ship --official (replaces verify + createPullRequest)
  let shipPath: PostShipResult['shipPath'] = 'none';
  let verdict: 'PASS' | 'FAIL' = 'FAIL';

  const shipPhaseResult = await invokeClaudePhase(
    buildShipPrompt(issue, config.branch, config.repo),
    'ship',
    config.configModels,
    config.cliOverrides,
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

  // 8. Debrief — spec vs built comparison, best-effort, never blocks pipeline
  try {
    // Load vault context for debrief — same layer as plan/cook in builder
    let debriefVaultSection = '';
    try {
      const ctx = await loadVaultContext(config.vaultPath, { title: issue.title });
      if (ctx) debriefVaultSection = `\n\n${ctx}`;
    } catch { /* swallow */ }

    const debriefPrompt = `/ttw:debrief Compare spec vs built for #${issue.number}: ${issue.title}

Type: ${classified.issueType} | Mode: official (vault)
Check plans/ for spec.md and plan.md. Write debrief.md to plans/reports/.${debriefVaultSection}`;
    const debriefResult = await invokeClaudePhase(
      debriefPrompt, 'debrief', config.configModels, config.cliOverrides, config.autoMode, config.cwd,
    );
    results.push(debriefResult);
    console.log('[post-ship] debrief complete');
  } catch {
    // never block
  }

  // 9. Slack report — best-effort
  const slackConfig: SlackReporterConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const slackResult = await executeSlackReport(
    classified, slackConfig, [...flowResults, ...results], verdict,
  );
  results.push(slackResult);

  // 10. Journal — always runs last
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

  // 11. AI-native docs generation — best-effort
  const llmsPrompt = `/ck:llms Generate llms.txt for AI-native codebase comprehension after shipping #${issue.number}`;
  const llmsResult = await invokeClaudePhase(
    llmsPrompt, 'docs', config.configModels, config.cliOverrides, config.autoMode, config.cwd,
  );
  results.push(llmsResult);

  // 12. Run recorder — pure file write, best-effort
  const runConfig: RunRecordConfig = { vaultPath: config.vaultPath };
  await recordRun(classified, runConfig, flowResults, results, verdict);

  // 13. Knowledge extraction — classify recent notes + failed phases, best-effort
  try {
    const lockOk = await acquireCycleLock(config.vaultPath, 'pull');
    if (lockOk) {
      await extractKnowledge(config.vaultPath, classified, flowResults, results, config.repo);
      console.log('[post-ship] knowledge extraction complete');
    } else {
      console.log('[post-ship] cycle-guard denied knowledge extraction — already ran this cycle');
    }
  } catch {
    // never block pipeline
  }

  // Gate officialComplete on confirmed vault artifact presence — ship PASS alone is not sufficient
  const vaultTraceExists = await isVaultTracePresent(config.vaultPath, issue.number);
  if (!vaultTraceExists) {
    console.log('[post-ship] WARNING: vault trace incomplete (run-recorder or journal file missing) — officialComplete=false');
  }

  return {
    results,
    verdict,
    pipelinePassed: verdict === 'PASS',
    shipPath,
    officialComplete: verdict === 'PASS' && vaultTraceExists,
  };
}
