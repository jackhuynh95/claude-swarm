import { spawn, execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';

// ─── Model routing: step → claude model ─────────────────────────────────────

const MODEL_MAP = {
  plan:   'claude-opus-4-5',
  cook:   'claude-sonnet-4-5',
  test:   'claude-sonnet-4-5',
  commit: 'claude-haiku-4-5-20251001',
} as const;

type Step = keyof typeof MODEL_MAP;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  auto?:           boolean;
  budget?:         number;          // --max-budget-usd per claude call
  permissionMode?: 'auto' | 'skip'; // 'auto' → --permission-mode auto, 'skip' → --dangerously-skip-permissions
  timeout?:        number;          // seconds per subprocess (default 600)
  dryRun?:         boolean;
  fromIssue?:      number;          // skip child issues < this number
  fromEpic?:       number;          // skip epics < this number (for --all)
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

async function runStep(step: Step, prompt: string, opts: ExecutorOptions): Promise<StepResult> {
  return spawnClaude(prompt, {
    model:          MODEL_MAP[step],
    budget:         opts.budget,
    permissionMode: opts.permissionMode,
    timeout:        opts.timeout,
  });
}

// ─── Execute one epic ─────────────────────────────────────────────────────────

export async function executeEpic(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  console.log(chalk.blue(`\n▶ Epic #${epicNumber}`));
  const children = fetchEpicChildren(epicNumber);
  if (children.length === 0) { console.log(chalk.yellow('  No child issues found')); return; }
  console.log(chalk.dim(`  Found ${children.length} issue(s)`));

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
    const pipeline: { name: Step; prompt: string }[] = [
      { name: 'plan',   prompt: `/ck:plan --fast Implement #${child.number}: ${child.title}` },
      { name: 'cook',   prompt: `/ck:cook --auto #${child.number}: ${child.title}` },
      { name: 'test',   prompt: `/test` },
      { name: 'commit', prompt: `/ck:git cm` },
    ];

    let allPassed = true;
    for (const { name, prompt } of pipeline) {
      const spinner = ora(`    ${name}...`).start();
      const result  = await runStep(name, prompt, opts);
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
  for (const child of children) {
    if (opts.dryRun) { console.log(chalk.cyan(`  [DRY RUN] /ck:plan --fast Implement #${child.number}: ${child.title}`)); continue; }
    const spinner = ora(`  #${child.number}: ${child.title}`).start();
    const result  = await runStep('plan', `/ck:plan --fast Implement #${child.number}: ${child.title}`, opts);
    result.success ? spinner.succeed() : spinner.fail(chalk.red(result.stderr.slice(0, 120)));
  }
}

export async function cookEpicIssues(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  const children = fetchEpicChildren(epicNumber).filter(c => !isIssueClosed(c.number));
  console.log(chalk.blue(`\n▶ Cooking ${children.length} issue(s) in epic #${epicNumber}`));
  for (const child of children) {
    if (opts.dryRun) { console.log(chalk.cyan(`  [DRY RUN] /ck:cook --auto #${child.number}: ${child.title}`)); continue; }
    const spinner = ora(`  #${child.number}: ${child.title}`).start();
    const result  = await runStep('cook', `/ck:cook --auto #${child.number}: ${child.title}`, opts);
    result.success ? spinner.succeed() : spinner.fail(chalk.red(result.stderr.slice(0, 120)));
  }
}
