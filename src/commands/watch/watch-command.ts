import { Command } from 'commander';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GHIssue, PhaseResult, WatchConfig, ModelOverrides, PhaseModelConfig, ClaudeModel, EffortLevel } from './types.js';
import { classifyIssue } from './phases/issue-router.js';
import { executeDebugFlow } from './phases/debug-flow.js';
import { executeShipFlow } from './phases/ship-flow.js';
import { executePostShip, executeBestEffortDebrief } from './phases/post-ship-runner.js';
import { executeClarifyPhase } from './phases/clarifier.js';
import { transitionLabel, addComment } from './phases/label-manager.js';
import { resolveRepo, loadProjectConfig } from '../../config-resolver.js';
import { invokeClaudePhase } from './phases/claude-invoker.js';
import { releaseCycleLock } from '../sync/cycle-guard.js';

const execFileAsync = promisify(execFile);

/** Track processed issues per hour for rate limiting */
const hourlyProcessed: number[] = [];

export const watchCommand = new Command('watch')
  .description('Watch GitHub issues and dispatch to execution flows')
  .option('--repo <repo>', 'GitHub repository (owner/repo) — auto-detected from git remote')
  .option('--interval <ms>', 'Poll interval in milliseconds', '60000')
  .option('--max-per-hour <n>', 'Max issues processed per hour', '10')
  .option('--auto', 'Enable dangerously-skip-permissions mode', false)
  .option('--vault <path>', 'Obsidian vault path for journaling')
  .option('--base-url <url>', 'Base URL for E2E tests')
  .option('--red-team', 'Enable adversarial red-team verification', false)
  .option('--use-team', 'Use /ck:team for parallel agent execution', false)
  .option('--dry-run', 'Fetch and classify issues without executing flows', false)
  .option('--model <model>', 'Override model for all phases (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all phases (low|medium|high|max)')
  .action(async (options) => {
    // Resolve repo: CLI flag > .claude-swarm.json > git remote
    const projectConfig = loadProjectConfig();
    const configModels = projectConfig.models;
    const cliOverrides: ModelOverrides = {};
    if (options.model) cliOverrides.model = options.model as ClaudeModel;
    if (options.effort) cliOverrides.effort = options.effort as EffortLevel;
    const repo = resolveRepo(options.repo);
    if (!repo) {
      console.error('[watch] Error: Could not detect repo. Use --repo or add .claude-swarm.json');
      process.exit(1);
    }

    const config: WatchConfig = {
      repo,
      intervalMs: parseInt(options.interval ?? projectConfig.interval ?? '60000', 10),
      maxPerHour: parseInt(options.maxPerHour ?? projectConfig.maxPerHour ?? '10', 10),
      labels: {
        trigger: 'ready_for_dev',
        shipped: 'shipped',
        verified: 'verified',
        error: 'error',
      },
    };

    console.log(`[watch] Starting daemon — repo=${config.repo} interval=${config.intervalMs}ms max=${config.maxPerHour}/hr`);
    if (options.dryRun) console.log('[watch] DRY RUN — will classify but not execute');

    // Run first poll immediately, then on interval
    await pollAndDispatch(config, { ...options, configModels, cliOverrides });
    setInterval(() => pollAndDispatch(config, { ...options, configModels, cliOverrides }), config.intervalMs);
  });

/**
 * Single poll cycle: fetch trigger-labeled issues, classify, dispatch.
 */
async function pollAndDispatch(
  config: WatchConfig,
  options: {
    auto: boolean; vault?: string; baseUrl?: string; redTeam: boolean; useTeam: boolean; dryRun: boolean;
    configModels?: Record<string, PhaseModelConfig>;
    cliOverrides?: ModelOverrides;
  },
): Promise<void> {
  try {
    // Watzup — quick recent changes summary before processing issues
    const watzupResult = await invokeClaudePhase(
      '/ck:watzup Review recent git changes and summarize current project state.',
      'watzup', options.configModels, options.cliOverrides, options.auto,
    );
    if (watzupResult.output) {
      console.log(`[watch] watzup: ${watzupResult.output.slice(0, 200)}`);
    }

    const issues = await fetchTriggerIssues(config.repo, config.labels.trigger);
    if (issues.length === 0) return;

    console.log(`[watch] Found ${issues.length} issue(s) with "${config.labels.trigger}" label`);

    for (const issue of issues) {
      // Rate limit check
      if (!checkRateLimit(config.maxPerHour)) {
        console.log(`[watch] Rate limit reached (${config.maxPerHour}/hr). Skipping remaining issues.`);
        break;
      }

      await processIssue(issue, config, options);
    }

    // Retro — sprint reflection after issues are processed
    if (issues.length > 0 && !options.dryRun) {
      const retroResult = await invokeClaudePhase(
        `/ck:retro Sprint retrospective: ${issues.length} issue(s) processed this cycle. Summarize what was done, what went well, what needs improvement.`,
        'retro', options.configModels, options.cliOverrides, options.auto,
      );
      if (retroResult.output) {
        console.log(`[watch] retro: ${retroResult.output.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.error(`[watch] Poll error:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Process a single issue through the full pipeline.
 */
async function processIssue(
  issue: GHIssue,
  config: WatchConfig,
  options: {
    auto: boolean; vault?: string; baseUrl?: string; redTeam: boolean; useTeam: boolean; dryRun: boolean;
    configModels?: Record<string, PhaseModelConfig>;
    cliOverrides?: ModelOverrides;
  },
): Promise<void> {
  const classified = classifyIssue(issue);
  console.log(`[watch] #${issue.number} "${issue.title}" → ${classified.flowType} (${classified.issueType})`);

  if (options.dryRun) return;

  recordProcessed();

  try {
    // 1. Clarify phase — check if issue spec is clear enough
    const clarifyResult = await executeClarifyPhase(classified, {
      repo: config.repo,
      autoMode: options.auto,
    });

    if (!clarifyResult.ready) {
      console.log(`[watch] #${issue.number} needs clarification — pausing until human replies`);
      return;
    }

    // 2. Main flow: debug-flow (bugs) or ship-flow (features/docs/chore)
    let flowResults: PhaseResult[];
    let branch: string | undefined;

    // Merge issue-level model override (hard label) with CLI overrides; CLI wins
    const issueOverrides: ModelOverrides = {
      model: options.cliOverrides?.model ?? classified.modelOverride,
      effort: options.cliOverrides?.effort,
    };

    if (classified.flowType === 'debug-flow') {
      flowResults = await executeDebugFlow(classified, {
        repo: config.repo,
        maxCycles: 3,
        autoMode: options.auto,
        configModels: options.configModels,
        cliOverrides: issueOverrides,
      });
    } else {
      flowResults = await executeShipFlow(classified, {
        repo: config.repo,
        autoMode: options.auto,
        noTest: classified.noTest,
        vaultPath: options.vault,
        configModels: options.configModels,
        cliOverrides: issueOverrides,
      });
    }

    // Extract branch name from artifacts (PR URL contains branch info)
    branch = extractBranchFromResults(flowResults) ?? `issue-${issue.number}`;

    // 3. Post-ship phases (verify, e2e, design review, slack, journal)
    if (options.vault) {
      const postShipResult = await executePostShip(classified, {
        repo: config.repo,
        autoMode: options.auto,
        branch,
        baseUrl: options.baseUrl,
        vaultPath: options.vault,
        redTeam: options.redTeam,
        configModels: options.configModels,
        cliOverrides: issueOverrides,
      }, flowResults);

      const allPhases = [...flowResults, ...postShipResult.results];
      const failCount = allPhases.filter(r => !r.success).length;
      const completionStatus = postShipResult.officialComplete
        ? 'OFFICIAL COMPLETE'
        : 'WARNING: vault trace may be incomplete';
      console.log(
        `[watch] #${issue.number} ${completionStatus} — verdict=${postShipResult.verdict} phases=${allPhases.length} failures=${failCount}`
      );
    } else {
      // No vault — run best-effort debrief only; not officially traceable
      await executeBestEffortDebrief(classified, options.auto);
      const failCount = flowResults.filter(r => !r.success).length;
      console.log(
        `[watch] #${issue.number} BEST-EFFORT COMPLETE — phases=${flowResults.length} failures=${failCount} | no vault trace (not official)`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[watch] #${issue.number} error: ${msg}`);
    await transitionLabel(config.repo, issue.number, undefined, 'error');
    await addComment(config.repo, issue.number, `Watch daemon error: ${msg}`);
  } finally {
    // Release cycle lock so next issue can acquire it
    if (options.vault) {
      await releaseCycleLock(options.vault);
      console.log('[watch] cycle-guard released');
    }
  }
}

/**
 * Fetch open issues with the trigger label via gh CLI.
 */
async function fetchTriggerIssues(repo: string, triggerLabel: string): Promise<GHIssue[]> {
  const { stdout } = await execFileAsync('gh', [
    'issue', 'list',
    '--label', triggerLabel,
    '--state', 'open',
    '--json', 'number,title,body,labels,state,assignee,url,createdAt,updatedAt',
    '--limit', '20',
    '-R', repo,
  ]);

  const raw = JSON.parse(stdout) as Array<Record<string, unknown>>;

  return raw.map((r) => ({
    number: r.number as number,
    title: r.title as string,
    body: (r.body as string) ?? null,
    labels: (r.labels as Array<{ name: string }>) ?? [],
    state: 'open' as const,
    assignee: r.assignee as GHIssue['assignee'],
    html_url: r.url as string,
    created_at: r.createdAt as string,
    updated_at: r.updatedAt as string,
  }));
}

/**
 * Rate limiting: allow max N issues per rolling hour window.
 */
function checkRateLimit(maxPerHour: number): boolean {
  const oneHourAgo = Date.now() - 3_600_000;
  // Prune old entries
  while (hourlyProcessed.length > 0 && hourlyProcessed[0] < oneHourAgo) {
    hourlyProcessed.shift();
  }
  return hourlyProcessed.length < maxPerHour;
}

function recordProcessed(): void {
  hourlyProcessed.push(Date.now());
}

/**
 * Try to extract branch name from PR URLs in phase results.
 */
function extractBranchFromResults(results: PhaseResult[]): string | undefined {
  for (const r of results) {
    if (r.artifacts) {
      for (const a of r.artifacts) {
        // PR URLs don't contain branch name directly, but issue number is in the branch
        const match = a.match(/\/pull\/(\d+)/);
        if (match) return undefined; // let caller use fallback
      }
    }
  }
  return undefined;
}
