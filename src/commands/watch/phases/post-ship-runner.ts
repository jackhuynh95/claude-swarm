import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { executeVerify, type VerifierConfig, type VerifyVerdict } from './verifier.js';
import { executeE2e, type E2eConfig } from './e2e-runner.js';
import { executeDesignReview, type DesignReviewConfig } from './design-reviewer.js';
import { executeSlackReport, type SlackReporterConfig } from './slack-reporter.js';
import { executeJournal, type JournalConfig } from './journal-writer.js';
import { recordRun, type RunRecordConfig } from './run-recorder.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { executeSecurityFlow, type SecurityFlowConfig } from './security-flow.js';

export interface PostShipConfig {
  repo: string;
  autoMode: boolean;
  branch: string;
  baseUrl?: string;           // E2E base URL (undefined = skip E2E)
  e2eScenarios?: string[];
  vaultPath: string;          // obsidian-vault path
  cwd?: string;
  redTeam?: boolean;          // enable adversarial red-team verification
}

export interface PostShipResult {
  results: PhaseResult[];
  verdict: VerifyVerdict;     // from verifier
  pipelinePassed: boolean;    // false if verify or e2e failed
}

/**
 * Orchestrates all post-ship phases in sequence:
 * verify → e2e → design-review → slack-report → journal
 *
 * Fail-fast: verifier FAIL or e2e FAIL stops the pipeline.
 * Design review, slack report, and journal never block.
 */
export async function executePostShip(
  classified: ClassifiedIssue,
  config: PostShipConfig,
  flowResults: PhaseResult[],
): Promise<PostShipResult> {
  const results: PhaseResult[] = [];

  const verifierConfig: VerifierConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    branch: config.branch,
    cwd: config.cwd,
    redTeam: config.redTeam,
  };

  // 1. Verify (with optional red-team pass) — FAIL stops pipeline
  const verifyResult = await executeVerify(classified, verifierConfig);
  results.push(verifyResult.phaseResult);

  if (verifyResult.verdict === 'FAIL') {
    return { results, verdict: 'FAIL', pipelinePassed: false };
  }

  // 2. Security flow (red testing) — runs when issue has "security" label
  if (classified.flags.securityScan) {
    const securityConfig: SecurityFlowConfig = {
      repo: config.repo,
      autoMode: config.autoMode,
      cwd: config.cwd,
    };
    const securityResult = await executeSecurityFlow(classified, securityConfig);
    results.push(...securityResult.results);

    // Red test failure is advisory — does NOT block pipeline
    // (per roadmap: only GREEN FAIL blocks, RED is informational)
  }

  // 3. E2E — FAIL stops pipeline (skips if no baseUrl)
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
    return { results, verdict: verifyResult.verdict, pipelinePassed: false };
  }

  // 4. Design review — advisory only, never blocks
  const designConfig: DesignReviewConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const designResult = await executeDesignReview(classified, designConfig);
  results.push(designResult.phaseResult);

  // 5. Slack report — best-effort, never blocks
  const slackConfig: SlackReporterConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const slackResult = await executeSlackReport(
    classified, slackConfig, [...flowResults, ...results], verifyResult.verdict,
  );
  results.push(slackResult);

  // 6. Journal — always runs last, never blocks
  const journalConfig: JournalConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    vaultPath: config.vaultPath,
    cwd: config.cwd,
  };
  const journalResult = await executeJournal(
    classified, journalConfig, [...flowResults, ...results], verifyResult.verdict,
  );
  results.push(journalResult);

  // 7. AI-native docs generation — best-effort, never blocks
  const llmsPrompt = `/ck:llms Generate llms.txt for AI-native codebase comprehension after shipping #${classified.issue.number}`;
  const llmsResult = await invokeClaudePhase(
    llmsPrompt, 'docs', classified.modelOverride, config.autoMode, config.cwd,
  );
  results.push(llmsResult);

  // 8. Run recorder — pure file write, best-effort, never blocks
  const runConfig: RunRecordConfig = { vaultPath: config.vaultPath };
  await recordRun(classified, runConfig, flowResults, results, verifyResult.verdict);

  return { results, verdict: verifyResult.verdict, pipelinePassed: true };
}
