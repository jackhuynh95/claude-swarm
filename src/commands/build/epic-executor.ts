import { spawn, execSync, spawnSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { createPullRequest } from '../watch/phases/branch-manager.js';
import { getPhaseConfig } from '../watch/phases/model-router.js';
import { loadProjectConfig } from '../../config-resolver.js';
import { parseRoadmap, type Epic, type Issue } from './roadmap-parser.js';
import type { ClaudeModel, EffortLevel, ModelOverrides, PhaseModelConfig, PhaseType } from '../watch/types.js';

type Step = 'plan' | 'plan-red-team' | 'cook' | 'test' | 'predict' | 'ship';

/** Map builder step names → PhaseType for model-router lookup */
const STEP_TO_PHASE: Record<Step, PhaseType> = {
  plan:            'plan',
  'plan-red-team': 'plan_redteam',
  cook:            'cook',
  test:            'test',
  predict:         'predict',
  ship:            'ship',
};

/** Map short model name → full Claude model ID */
function toModelId(model: ClaudeModel): string {
  const ids: Record<ClaudeModel, string> = {
    opus:   'claude-opus-4-6',
    sonnet: 'claude-sonnet-4-6',
    haiku:  'claude-haiku-4-5-20251001',
  };
  return ids[model];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  auto?:           boolean;
  hard?:           boolean;          // --hard mode: plan red-team + predict per issue
  budget?:         number;          // --max-budget-usd per claude call
  permissionMode?: 'auto' | 'skip'; // 'auto' → --permission-mode auto, 'skip' → --dangerously-skip-permissions
  timeout?:        number;          // seconds per subprocess (default 600)
  dryRun?:         boolean;
  fromIssue?:      number;          // skip child issues < this number
  fromEpic?:       number;          // skip epics < this number (for --all)
  model?:          string;          // CLI --model override (applies to all steps)
  effort?:         string;          // CLI --effort override (applies to all steps)
}

interface StepResult {
  success:    boolean;
  stdout:     string;
  stderr:     string;
  durationMs: number;
}

interface EpicChild {
  number:  number;
  title:   string;
  checked: boolean;
}

// ─── GitHub helpers (synchronous gh CLI wrappers) ─────────────────────────────

/** Parse epic body checklist `- [ ] #N title` → EpicChild[] */
export function fetchEpicChildren(epicNumber: number): EpicChild[] {
  const raw = execSync(`gh issue view ${epicNumber} --json body`, { encoding: 'utf-8' });
  const { body } = JSON.parse(raw) as { body: string };
  const children: EpicChild[] = [];
  const re = /- \[([ x])\]\s+#(\d+)\s+(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    children.push({ checked: m[1] === 'x', number: parseInt(m[2], 10), title: m[3].trim() });
  }
  return children;
}

export function isIssueClosed(issueNumber: number): boolean {
  const raw = execSync(`gh issue view ${issueNumber} --json state`, { encoding: 'utf-8' });
  return (JSON.parse(raw) as { state: string }).state === 'CLOSED';
}

export function closeIssue(issueNumber: number): void {
  execSync(`gh issue close ${issueNumber}`, { stdio: 'pipe' });
}

/** Replace `- [ ] #N` with `- [x] #N` in the epic body. */
export function updateEpicChecklist(epicNumber: number, childNumber: number): void {
  const raw = execSync(`gh issue view ${epicNumber} --json body`, { encoding: 'utf-8' });
  const { body } = JSON.parse(raw) as { body: string };
  const updated = body.replace(new RegExp(`- \\[ \\] #${childNumber}\\b`, 'g'), `- [x] #${childNumber}`);
  if (updated === body) return;
  execSync(`gh issue edit ${epicNumber} --body ${JSON.stringify(updated)}`);
}

/** Fetch all open issues labelled "epic". */
function fetchAllEpics(): number[] {
  const raw = execSync('gh issue list --label epic --state open --json number -L 100', { encoding: 'utf-8' });
  return (JSON.parse(raw) as { number: number }[]).map(i => i.number).sort((a, b) => a - b);
}

// ─── Claude subprocess runner ─────────────────────────────────────────────────

function spawnClaude(
  prompt: string,
  opts: { model: string; budget?: number; permissionMode?: 'auto' | 'skip'; timeout?: number },
): Promise<StepResult> {
  return new Promise(resolve => {
    const start = Date.now();
    const args = ['-p', prompt, '--model', opts.model, '--output-format', 'text'];
    if (opts.budget)                          args.push('--max-budget-usd', String(opts.budget));
    if (opts.permissionMode === 'skip')        args.push('--dangerously-skip-permissions');
    else if (opts.permissionMode === 'auto')   args.push('--permission-mode', 'auto');

    // Debug: log the command being spawned (visible in verbose mode)
    if (process.env.DEBUG) {
      console.error(chalk.dim(`  [debug] claude ${args.map(a => a.startsWith('/') || a.includes(' ') ? JSON.stringify(a) : a).join(' ')}`));
    }

    const proc = spawn('claude', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });

    const timeoutMs = (opts.timeout ?? 600) * 1_000;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    }, timeoutMs);

    const finish = (code: number | null) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        success:    !timedOut && code === 0,
        stdout,
        stderr:     timedOut ? `Timed out after ${opts.timeout ?? 600}s` : stderr,
        durationMs: Date.now() - start,
      });
    };

    proc.on('close', finish);
    proc.on('error', err => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ success: false, stdout, stderr: err.message, durationMs: Date.now() - start });
    });
  });
}

// ─── Single-step runner ───────────────────────────────────────────────────────

async function runStep(
  step: Step,
  prompt: string,
  opts: ExecutorOptions,
  configModels?: Record<string, PhaseModelConfig>,
): Promise<StepResult> {
  const cliOverrides: ModelOverrides = {};
  if (opts.model) cliOverrides.model = opts.model as ClaudeModel;
  if (opts.effort) cliOverrides.effort = opts.effort as EffortLevel;

  // --auto implies --dangerously-skip-permissions for all steps
  const permissionMode = (opts.auto && !opts.permissionMode) ? 'skip' as const : opts.permissionMode;

  const phase = STEP_TO_PHASE[step];
  const config = getPhaseConfig(phase, configModels, cliOverrides);

  return spawnClaude(prompt, {
    model:          toModelId(config.model),
    budget:         opts.budget,
    permissionMode,
    timeout:        opts.timeout,
  });
}

// ─── Ship step: /ck:ship --official with createPullRequest() fallback ─────────

async function shipIssue(issue: EpicChild, opts: ExecutorOptions, configModels?: Record<string, PhaseModelConfig>): Promise<StepResult> {
  // Use runStep so auto→skip is applied consistently
  const shipResult = await runStep('ship', '/ck:ship --official', opts, configModels);

  if (shipResult.success) {
    console.log(chalk.green(`    shipped via /ck:ship`));
    return shipResult;
  }

  // Fallback to createPullRequest() from branch-manager.ts
  console.log(chalk.yellow(`    /ck:ship failed — falling back to createPullRequest()`));
  try {
    const repo   = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    await createPullRequest(repo, issue.number, issue.title, 'feature', branch);
    console.log(chalk.green(`    shipped via fallback`));
    return { success: true, stdout: 'fallback PR', stderr: '', durationMs: 0 };
  } catch (err) {
    console.error(chalk.red(`    both /ck:ship and fallback failed`));
    return { success: false, stdout: '', stderr: String(err), durationMs: 0 };
  }
}

// ─── Execute one epic ─────────────────────────────────────────────────────────

export async function executeEpic(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  console.log(chalk.blue(`\n▶ Epic #${epicNumber}`));
  const children = fetchEpicChildren(epicNumber);
  if (children.length === 0) { console.log(chalk.yellow('  No child issues found')); return; }
  console.log(chalk.dim(`  Found ${children.length} issue(s)`));

  // Load config models once per epic execution
  const configModels = loadProjectConfig().models;

  for (const child of children) {
    if (opts.fromIssue && child.number < opts.fromIssue) {
      console.log(chalk.dim(`  ⟶ #${child.number} skipped (--from-issue ${opts.fromIssue})`));
      continue;
    }
    if (isIssueClosed(child.number)) {
      console.log(chalk.dim(`  ✓ #${child.number} already closed — skipping`));
      continue;
    }
    if (opts.dryRun) {
      console.log(chalk.cyan(`  [DRY RUN] Would process #${child.number}: ${child.title}`));
      continue;
    }

    console.log(chalk.white(`\n  ► #${child.number}: ${child.title}`));

    // Build pipeline dynamically based on --hard mode
    const pipeline: { name: string; fn: () => Promise<StepResult> }[] = [];

    if (opts.hard) {
      pipeline.push({ name: 'plan',          fn: () => runStep('plan',          `/ck:plan --hard Implement #${child.number}: ${child.title}`,    opts, configModels) });
      pipeline.push({ name: 'plan-red-team', fn: () => runStep('plan-red-team', `/ck:plan red-team #${child.number}: ${child.title}`,            opts, configModels) });
    } else {
      pipeline.push({ name: 'plan',          fn: () => runStep('plan',          `/ck:plan --fast Implement #${child.number}: ${child.title}`,    opts, configModels) });
    }

    pipeline.push({ name: 'cook', fn: () => runStep('cook', `/ck:cook --auto #${child.number}: ${child.title}`, opts, configModels) });
    pipeline.push({ name: 'test', fn: () => runStep('test', `/ck:test`,                                         opts, configModels) });

    if (opts.hard) {
      pipeline.push({ name: 'predict', fn: () => runStep('predict', `/ck:predict #${child.number}: ${child.title}`, opts, configModels) });
    }

    pipeline.push({ name: 'ship', fn: () => shipIssue(child, opts, configModels) });

    // Execute pipeline steps sequentially
    let allPassed = true;
    for (const { name, fn } of pipeline) {
      const spinner = ora(`    ${name}...`).start();
      const result  = await fn();
      const dur     = (result.durationMs / 1000).toFixed(1);
      if (result.success) {
        spinner.succeed(chalk.green(`    ${name} ✓ (${dur}s)`));
      } else {
        spinner.fail(chalk.red(`    ${name} ✗ (${dur}s)`));
        if (result.stderr) console.error(chalk.dim(`      ${result.stderr.slice(0, 200)}`));
        allPassed = false;
        break;
      }
    }

    if (allPassed) {
      closeIssue(child.number);
      updateEpicChecklist(epicNumber, child.number);
      console.log(chalk.green(`  ✓ #${child.number} completed and closed`));
    } else {
      console.log(chalk.red(`  ✗ #${child.number} pipeline failed — skipping close`));
    }
  }
}

// ─── Execute all epics ────────────────────────────────────────────────────────

export async function executeAllEpics(opts: ExecutorOptions = {}): Promise<void> {
  const epics = fetchAllEpics().filter(n => !opts.fromEpic || n >= opts.fromEpic);
  console.log(chalk.blue(`\n▶ Running ${epics.length} epic(s)`));
  for (const epicNumber of epics) await executeEpic(epicNumber, opts);
  console.log(chalk.green('\n✓ All epics processed'));
}

// ─── Single-step epic runners (for `build plan` / `build cook` subcommands) ───

export async function planEpicIssues(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  const children = fetchEpicChildren(epicNumber).filter(c => !isIssueClosed(c.number));
  console.log(chalk.blue(`\n▶ Planning ${children.length} issue(s) in epic #${epicNumber}`));
  const configModels = loadProjectConfig().models;
  for (const child of children) {
    if (opts.dryRun) { console.log(chalk.cyan(`  [DRY RUN] /ck:plan --fast Implement #${child.number}: ${child.title}`)); continue; }
    const spinner = ora(`  #${child.number}: ${child.title}`).start();
    const result  = await runStep('plan', `/ck:plan --fast Implement #${child.number}: ${child.title}`, opts, configModels);
    result.success ? spinner.succeed() : spinner.fail(chalk.red(result.stderr.slice(0, 120)));
  }
}

export async function cookEpicIssues(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  const children = fetchEpicChildren(epicNumber).filter(c => !isIssueClosed(c.number));
  console.log(chalk.blue(`\n▶ Cooking ${children.length} issue(s) in epic #${epicNumber}`));
  const configModels = loadProjectConfig().models;
  for (const child of children) {
    if (opts.dryRun) { console.log(chalk.cyan(`  [DRY RUN] /ck:cook --auto #${child.number}: ${child.title}`)); continue; }
    const spinner = ora(`  #${child.number}: ${child.title}`).start();
    const result  = await runStep('cook', `/ck:cook --auto #${child.number}: ${child.title}`, opts, configModels);
    result.success ? spinner.succeed() : spinner.fail(chalk.red(result.stderr.slice(0, 120)));
  }
}

// ─── Roadmap-based execution (reads from docs/roadmap.md, syncs to GitHub issue) ─

/** Check a task in the [MILESTONE] issue body: replace `- [ ] {title}` → `- [x] {title}` */
function checkMilestoneTask(issueNumber: number, taskTitle: string): void {
  try {
    const raw = execSync(`gh issue view ${issueNumber} --json body`, { encoding: 'utf-8' });
    const { body } = JSON.parse(raw) as { body: string };
    // Escape regex special chars in title for safe matching
    const escaped = taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const updated = body.replace(new RegExp(`- \\[ \\] ${escaped}`), `- [x] ${taskTitle}`);
    if (updated === body) return;
    // Use spawnSync with args array to avoid shell interpretation of backticks in body
    spawnSync('gh', ['issue', 'edit', String(issueNumber), '--body', updated], { stdio: 'pipe' });
  } catch {
    // Non-critical — log and continue
    console.error(chalk.dim(`  ⚠ Failed to update checklist for: ${taskTitle.slice(0, 50)}`));
  }
}

/** Read the roadmap file and build a flat task list with phase context. */
function loadRoadmapTasks(roadmapPath: string): Array<{ epic: Epic; issue: Issue; epicIndex: number; issueIndex: number }> {
  const filePath = roadmapPath.replace(/^@/, '');
  const roadmap = parseRoadmap(filePath);
  const tasks: Array<{ epic: Epic; issue: Issue; epicIndex: number; issueIndex: number }> = [];
  for (let ei = 0; ei < roadmap.epics.length; ei++) {
    const epic = roadmap.epics[ei];
    for (let ii = 0; ii < epic.issues.length; ii++) {
      tasks.push({ epic, issue: epic.issues[ii], epicIndex: ei, issueIndex: ii });
    }
  }
  return tasks;
}

/**
 * Execute tasks from a roadmap file directly (no GitHub epic issues needed).
 * Use --phase N to run a single phase, or --all / omit for all phases.
 * Optionally syncs progress to a [MILESTONE] tracking issue via --issue N.
 */
export async function executeFromRoadmap(
  roadmapPath: string,
  opts: ExecutorOptions & { trackingIssue?: number; phase?: number } = {},
): Promise<void> {
  let tasks = loadRoadmapTasks(roadmapPath);

  // Filter to specific phase if --phase N provided (1-indexed)
  if (opts.phase != null) {
    const phaseIndex = opts.phase - 1;
    const phaseExists = tasks.some(t => t.epicIndex === phaseIndex);
    if (!phaseExists) {
      const maxPhase = Math.max(...tasks.map(t => t.epicIndex)) + 1;
      console.error(chalk.red(`Error: phase ${opts.phase} not found (roadmap has ${maxPhase} phases)`));
      process.exit(1);
    }
    tasks = tasks.filter(t => t.epicIndex === phaseIndex);
  }

  // Filter by --from-task (skip tasks with ID < N)
  if (opts.fromIssue) {
    tasks = tasks.filter(t => parseInt(t.issue.id, 10) >= opts.fromIssue!);
  }

  const configModels = loadProjectConfig().models;
  const totalTasks = tasks.length;
  let completed = 0;
  let failed = 0;

  const phaseLabel = opts.phase != null ? ` (phase ${opts.phase})` : '';
  console.log(chalk.blue(`\n▶ Running ${totalTasks} task(s) from roadmap${phaseLabel}`));
  if (opts.trackingIssue) {
    console.log(chalk.dim(`  Syncing progress to issue #${opts.trackingIssue}`));
  }

  let currentEpicIndex = -1;

  for (const { epic, issue, epicIndex } of tasks) {
    // Print phase header when switching to a new phase
    if (epicIndex !== currentEpicIndex) {
      currentEpicIndex = epicIndex;
      console.log(chalk.blue(`\n  ── Phase ${epicIndex + 1}: ${epic.title} ──`));
    }

    if (opts.dryRun) {
      console.log(chalk.cyan(`  [DRY RUN] Task ${issue.id}: ${issue.title}`));
      continue;
    }

    console.log(chalk.white(`\n  ► Task ${issue.id}: ${issue.title}`));

    // Cook the task — include roadmap path for context
    const cookPrompt = `/ck:cook --auto Implement task: ${issue.title}. Phase: ${epic.title}. Roadmap: ${roadmapPath}`;

    const spinner = ora(`    cooking...`).start();
    const result = await runStep('cook', cookPrompt, opts, configModels);
    const dur = (result.durationMs / 1000).toFixed(1);

    if (result.success) {
      spinner.succeed(chalk.green(`    ✓ Task ${issue.id} (${dur}s)`));
      completed++;

      // Sync to GitHub issue
      if (opts.trackingIssue) {
        checkMilestoneTask(opts.trackingIssue, issue.title);
      }
    } else {
      spinner.fail(chalk.red(`    ✗ Task ${issue.id} (${dur}s)`));
      if (result.stderr) console.error(chalk.dim(`      ${result.stderr.slice(0, 200)}`));
      failed++;
    }
  }

  // Summary
  console.log(chalk.green(`\n✓ Roadmap execution complete: ${completed}/${totalTasks} succeeded, ${failed} failed`));
}
