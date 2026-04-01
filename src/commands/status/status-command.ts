import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import { TaskRegistry } from './task-registry.js';
import { getDailySummary } from '../watch/phases/cost-tracker.js';
import { renderMatrix } from './capability-matrix.js';
import { searchAll } from './search-index.js';
import type { TaskMetadata } from '../watch/types.js';

// ─── Formatting helpers ──────────────────────────────────────────────────────

function humanDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function taskDuration(task: TaskMetadata): string {
  if (!task.endedAt) return timeAgo(task.startedAt);
  return humanDuration(new Date(task.endedAt).getTime() - new Date(task.startedAt).getTime());
}

function statusIcon(task: TaskMetadata): string {
  if (!task.endedAt) return chalk.yellow('◉');
  if (task.exitReason === 'completed') return chalk.green('✓');
  if (task.exitReason === 'budget_exceeded') return chalk.red('$');
  return chalk.red('✗');
}

function colorState(state: string): string {
  if (['implementing', 'testing', 'verifying'].includes(state)) return chalk.yellow(state);
  if (state === 'completed') return chalk.green(state);
  if (['error', 'timeout'].includes(state)) return chalk.red(state);
  if (state === 'awaiting_approval') return chalk.cyan(state);
  return chalk.dim(state);
}

// ─── View renderers ──────────────────────────────────────────────────────────

function renderDashboard(registry: TaskRegistry, costPath?: string): void {
  const all = registry.listTasks();
  const active = all.filter((t) => !t.endedAt);
  const queued = all.filter((t) => !t.endedAt && t.state === 'awaiting_approval');
  const recent = all.filter((t) => t.endedAt).slice(0, 5);
  const summary = getDailySummary(undefined, costPath);

  console.log();
  console.log(chalk.bold('╭──────────────────────────────────────────────╮'));
  console.log(chalk.bold('│  claude-swarm status                         │'));
  console.log(chalk.bold('╰──────────────────────────────────────────────╯'));
  console.log();

  if (all.length === 0) {
    console.log(chalk.dim('  No tasks recorded yet. Run `claude-swarm watch` to start.'));
    console.log();
    return;
  }

  // Active
  const activeNonQueued = active.filter((t) => t.state !== 'awaiting_approval');
  console.log(chalk.bold(`▸ Active Tasks (${activeNonQueued.length})`));
  if (activeNonQueued.length === 0) {
    console.log(chalk.dim('  none'));
  } else {
    for (const t of activeNonQueued) {
      const title = t.issueTitle.slice(0, 32).padEnd(34);
      console.log(`  #${String(t.issueNumber).padEnd(4)} [${t.role.padEnd(10)}]  ${colorState(t.state).padEnd(20)}  "${title}"  ${chalk.dim(timeAgo(t.startedAt))}`);
    }
  }
  console.log();

  // Queue
  console.log(chalk.bold(`▸ Queue (${queued.length})`));
  if (queued.length === 0) {
    console.log(chalk.dim('  none'));
  } else {
    for (const t of queued) {
      const title = t.issueTitle.slice(0, 40);
      console.log(`  #${String(t.issueNumber).padEnd(4)} [${t.role}]  ${chalk.cyan('awaiting_approval')}  "${title}"`);
    }
  }
  console.log();

  // Recent
  console.log(chalk.bold(`▸ Recent (${recent.length})`));
  if (recent.length === 0) {
    console.log(chalk.dim('  none'));
  } else {
    for (const t of recent) {
      const icon = statusIcon(t);
      const title = t.issueTitle.slice(0, 30).padEnd(32);
      const dur = taskDuration(t).padEnd(6);
      const cost = t.costUsd != null ? chalk.dim(`$${t.costUsd.toFixed(2)}`) : '';
      console.log(`  ${icon} ${t.exitReason?.padEnd(14) ?? ''.padEnd(14)}  ${t.role.padEnd(10)}  "${title}"  ${dur}  ${cost}`);
    }
  }
  console.log();

  // Cost summary
  const runStr = `${summary.runCount} run${summary.runCount !== 1 ? 's' : ''}`;
  console.log(chalk.bold(`▸ Today: ${runStr} · $${summary.totalUsd.toFixed(2)} estimated`));
  console.log();
}

function renderActive(registry: TaskRegistry): void {
  const active = registry.listTasks().filter((t) => !t.endedAt);
  if (active.length === 0) {
    console.log(chalk.dim('No active tasks.'));
    return;
  }
  for (const t of active) {
    console.log(`  #${t.issueNumber}  [${t.role}]  ${colorState(t.state)}  "${t.issueTitle}"  ${chalk.dim(timeAgo(t.startedAt))}`);
  }
}

function renderRecent(registry: TaskRegistry, n: number): void {
  const done = registry.listTasks().filter((t) => t.endedAt).slice(0, n);
  if (done.length === 0) {
    console.log(chalk.dim('No completed tasks.'));
    return;
  }
  for (const t of done) {
    const icon = statusIcon(t);
    console.log(`  ${icon} #${t.issueNumber}  ${t.role}  "${t.issueTitle.slice(0, 40)}"  ${taskDuration(t)}  ${t.costUsd != null ? `$${t.costUsd.toFixed(2)}` : ''}`);
  }
}

function renderCost(costPath?: string): void {
  const s = getDailySummary(undefined, costPath);
  console.log(chalk.bold(`▸ Cost Summary — ${s.date}`));
  console.log(`  Runs today:     ${s.runCount}`);
  console.log(`  Estimated cost: $${s.totalUsd.toFixed(4)}`);
  if (s.topIssues.length > 0) {
    const top = s.topIssues.map((i) => `#${i.issue} ($${i.costUsd})`).join(', ');
    console.log(`  Top issues:     ${top}`);
  }
}

function renderTask(taskId: string, registry: TaskRegistry): void {
  const task = registry.getTask(taskId);
  if (!task) {
    console.error(chalk.red(`Task "${taskId}" not found.`));
    process.exit(1);
  }
  console.log(chalk.bold(`▸ Task: ${task.id}`));
  console.log(`  Issue:     #${task.issueNumber} — ${task.issueTitle}`);
  console.log(`  Flow:      ${task.role}  (${task.issueType})`);
  console.log(`  State:     ${colorState(task.state)}`);
  console.log(`  Started:   ${task.startedAt}`);
  if (task.endedAt) console.log(`  Ended:     ${task.endedAt}  (${taskDuration(task)})`);
  if (task.exitReason) console.log(`  Exit:      ${task.exitReason}${task.exitMessage ? ` — ${task.exitMessage}` : ''}`);
  if (task.costUsd != null) console.log(`  Cost:      $${task.costUsd.toFixed(4)}`);
  if (task.resumable) console.log(`  Resumable: ${chalk.yellow('yes')}`);
  if (task.artifacts.length > 0) {
    console.log('  Artifacts:');
    for (const a of task.artifacts) console.log(`    ${chalk.cyan(a)}`);
  }
  if (task.phases.length > 0) {
    console.log(`  Phases (${task.phases.length}):`);
    for (const p of task.phases) {
      const icon = p.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`    ${icon} ${p.phase.padEnd(14)}  ${humanDuration(p.durationMs)}${p.error ? chalk.red(`  ${p.error.slice(0, 60)}`) : ''}`);
    }
  }
}

function renderHistory(registry: TaskRegistry, issueFilter?: number, dateFilter?: string): void {
  const tasks = registry.listTasks({ issueNumber: issueFilter, date: dateFilter }).slice(0, 25);
  if (tasks.length === 0) {
    console.log(chalk.dim('No history found.'));
    return;
  }
  console.log(chalk.bold(`▸ Run History (${tasks.length})`));
  console.log();
  for (const t of tasks) {
    const icon = statusIcon(t);
    const dur = taskDuration(t).padEnd(8);
    const cost = t.costUsd != null ? `$${t.costUsd.toFixed(2)}` : '     ';
    const exit = (t.exitReason ?? t.state).padEnd(16);
    console.log(`  ${icon} ${t.id.padEnd(30)}  #${String(t.issueNumber).padEnd(5)}  ${exit}  ${dur}  ${cost}`);
    console.log(`    ${chalk.dim(t.issueTitle.slice(0, 60))}`);
  }
}

function renderResume(registry: TaskRegistry): void {
  const tasks = registry.getResumableTasks();
  console.log(chalk.bold(`▸ Resumable Tasks (${tasks.length})`));
  if (tasks.length === 0) {
    console.log(chalk.dim('  No resumable tasks.'));
    console.log();
    return;
  }
  console.log();
  for (const t of tasks) {
    const exit = (t.exitReason ?? 'unknown').padEnd(12);
    const msg = t.exitMessage ? chalk.dim(`  exit: ${t.exitMessage.slice(0, 50)}`) : '';
    console.log(`  ${t.id.padEnd(30)}  #${String(t.issueNumber).padEnd(5)}  ${chalk.red(exit)}  "${t.issueTitle.slice(0, 30)}"${msg}`);
  }
  console.log();
  console.log(chalk.dim('  Resume: claude-swarm watch --resume <task-id>'));
}

function renderSearch(query: string, registry: TaskRegistry): void {
  const cwd = process.cwd();
  const results = searchAll(query, {
    plansDir: join(cwd, 'plans'),
    vaultPath: join(cwd, 'obsidian-vault'),
    registry,
  });

  const total = results.plans.length + results.runs.length + results.reviews.length;
  console.log(chalk.bold(`▸ Search: "${query}" (${total} results)`));
  console.log();

  if (results.plans.length > 0) {
    console.log(chalk.underline('  Plans:'));
    for (const r of results.plans) {
      console.log(`    ${chalk.dim(r.path)}`);
      if (r.snippet) console.log(chalk.yellow(r.snippet));
    }
    console.log();
  }

  if (results.runs.length > 0) {
    console.log(chalk.underline('  Runs:'));
    for (const r of results.runs) {
      console.log(`    ${chalk.dim(r.path)}`);
      console.log(`    ${r.title} — ${r.snippet.trim()}`);
    }
    console.log();
  }

  if (results.reviews.length > 0) {
    console.log(chalk.underline('  Reviews:'));
    for (const r of results.reviews) {
      console.log(`    ${chalk.dim(r.path)}`);
      if (r.snippet) console.log(chalk.yellow(r.snippet));
    }
    console.log();
  }

  if (total === 0) {
    console.log(chalk.dim(`  No results for "${query}".`));
  }
}

// ─── Command definition ──────────────────────────────────────────────────────

export const statusCommand = new Command('status')
  .description('Show operator dashboard: active tasks, history, cost, capabilities')
  .option('--active',            'show only active/in-progress tasks')
  .option('--recent <n>',        'last N completed tasks', '10')
  .option('--cost',              'show today\'s cost summary')
  .option('--task <id>',         'detailed view of a single task')
  .option('--history',           'full run history (newest first, max 25)')
  .option('--issue <num>',       'filter history by issue number')
  .option('--date <YYYY-MM-DD>', 'filter history by date')
  .option('--resume',            'list resumable failed/timed-out tasks')
  .option('--matrix',            'show capability matrix')
  .option('--search <query>',    'search plans, runs, and reviews')
  .action((opts) => {
    const cwd = process.cwd();
    const registry = new TaskRegistry(join(cwd, '.ck-tasks.json'));
    const costPath = join(cwd, '.ck-costs.json');

    if (opts.matrix) {
      console.log();
      console.log(renderMatrix());
      console.log();
      return;
    }

    if (opts.search) {
      console.log();
      renderSearch(opts.search as string, registry);
      return;
    }

    if (opts.task) {
      console.log();
      renderTask(opts.task as string, registry);
      console.log();
      return;
    }

    if (opts.resume) {
      console.log();
      renderResume(registry);
      return;
    }

    if (opts.history) {
      const issueFilter = opts.issue ? Number(opts.issue) : undefined;
      const dateFilter = opts.date as string | undefined;
      console.log();
      renderHistory(registry, issueFilter, dateFilter);
      console.log();
      return;
    }

    if (opts.cost) {
      console.log();
      renderCost(costPath);
      console.log();
      return;
    }

    if (opts.active) {
      console.log();
      renderActive(registry);
      console.log();
      return;
    }

    if (opts.recent) {
      const n = Number(opts.recent);
      console.log();
      renderRecent(registry, n);
      console.log();
      return;
    }

    // Default: full dashboard
    renderDashboard(registry, costPath);
  });
