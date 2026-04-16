import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

interface GrillMePlanFastOptions {
  context?: string;
  model?: string;
  planDir?: string;
  auto?: boolean;
}

/**
 * Spawn Claude in interactive session mode (no -p flag).
 * Seeds first message, keeps session alive for multi-turn conversation.
 */
function spawnInteractiveSession(prompt: string, model: string, auto?: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [prompt, '--model', model];
    if (auto) args.push('--dangerously-skip-permissions');

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', (err) => reject(err));
  });
}

/**
 * Spawn Claude in one-shot mode (with -p flag) for planning.
 */
function spawnPlanningSession(prompt: string, model: string, auto?: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--model', model, '--output-format', 'text'];
    if (auto) args.push('--dangerously-skip-permissions');

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', (err) => reject(err));
  });
}

/**
 * Find the most recently modified spec.md in plans/ subdirectories.
 * If planDir is specified, looks there directly.
 */
function detectSpecPath(planDir?: string): string | null {
  if (planDir) {
    const specPath = join(planDir, 'spec.md');
    return existsSync(specPath) ? specPath : null;
  }

  const plansRoot = join(process.cwd(), 'plans');
  if (!existsSync(plansRoot)) return null;

  let newest: { path: string; mtime: number } | null = null;

  for (const entry of readdirSync(plansRoot)) {
    const specPath = join(plansRoot, entry, 'spec.md');
    if (!existsSync(specPath)) continue;
    const mtime = statSync(specPath).mtimeMs;
    if (!newest || mtime > newest.mtime) {
      newest = { path: specPath, mtime };
    }
  }

  return newest?.path ?? null;
}

/**
 * Find plan.md in the same directory as spec.md.
 */
function detectPlanPath(specPath: string): string | null {
  const dir = specPath.replace(/\/spec\.md$/, '');
  const planPath = join(dir, 'plan.md');
  return existsSync(planPath) ? planPath : null;
}

async function executeGrillMePlanFast(topic: string, options: GrillMePlanFastOptions): Promise<void> {
  const model = options.model ?? 'claude-opus-4-6';

  let contextContent = '';
  if (options.context) {
    try {
      contextContent = `\n\nAdditional context from ${options.context}:\n${readFileSync(options.context, 'utf8')}`;
    } catch {
      console.error(`Warning: Could not read context file: ${options.context}`);
    }
  }

  const planDirHint = options.planDir
    ? `\nWrite spec.md to: ${options.planDir}/spec.md`
    : '';

  // Record timestamp before grill-me to detect newly created spec.md
  const grillStartTime = Date.now();

  // ── Step 1: Interactive grill-me session ──────────────────────────────────
  const grillPrompt = `/ttw:grill-me ${topic}${contextContent}${planDirHint}

Ask 8-15 sharp questions, force decisions on major choices, consolidate answers, then write plans/<plan-dir>/spec.md and output the handoff command.`;

  console.log(chalk.bold(`\nGrilling: "${topic}"...\n`));

  const exitCode = await spawnInteractiveSession(grillPrompt, model, options.auto);
  if (exitCode !== 0) {
    console.error(chalk.red('\nGrill-me session failed or was cancelled.'));
    process.exit(exitCode);
  }

  // ── Step 2: Detect spec.md ────────────────────────────────────────────────
  console.log(chalk.dim('\nDetecting spec.md...'));

  const specPath = detectSpecPath(options.planDir);
  if (!specPath) {
    console.error(chalk.red('Error: No spec.md found after grill-me session.'));
    console.error(chalk.dim('Expected in plans/<plan-dir>/spec.md'));
    process.exit(1);
  }

  // Verify spec was created/modified during this session
  const specMtime = statSync(specPath).mtimeMs;
  if (specMtime < grillStartTime) {
    console.error(chalk.red('Error: No new spec.md was generated during this grill-me session.'));
    console.error(chalk.dim(`Found stale spec: ${specPath}`));
    process.exit(1);
  }

  const planDir = specPath.replace(/\/spec\.md$/, '');
  console.log(chalk.green(`Spec written: ${specPath}`));

  // ── Step 3: Fast planning from spec (one-shot) ───────────────────────────
  console.log(chalk.bold('\nPlanning...\n'));

  const specContent = readFileSync(specPath, 'utf8');
  const planPrompt = `/ck:plan --fast

Read the spec below and generate a phase-based implementation plan.
Write plan.md and phase-*.md files to: ${planDir}/

--- spec.md ---
${specContent}`;

  const planModel = 'claude-sonnet-4-6';
  const planCode = await spawnPlanningSession(planPrompt, planModel, options.auto);

  if (planCode !== 0) {
    console.error(chalk.red('\nPlanning step failed.'));
    process.exit(planCode);
  }

  // ── Step 4: Verify plan.md and print summary ─────────────────────────────
  const planPath = detectPlanPath(specPath);

  console.log(chalk.bold('\n── Summary ──────────────────────────────────'));
  console.log(chalk.green(`  Spec: ${specPath}`));

  if (planPath) {
    console.log(chalk.green(`  Plan: ${planPath}`));
  } else {
    console.log(chalk.yellow(`  Plan: not detected (check ${planDir}/ manually)`));
  }

  console.log(chalk.bold('\n── Next ─────────────────────────────────────'));
  console.log(chalk.cyan(`  claude-swarm build run --auto --roadmap @${planPath ?? `${planDir}/plan.md`}`));
  console.log('');
}

export const grillMePlanFastCommand = new Command('grill-me-plan-fast')
  .description('Grill-me interview → spec.md → fast plan → plan.md in one flow')
  .argument('<topic>', 'Topic or request to clarify and plan')
  .option('-c, --context <file>', 'Context file path (e.g. @docs/roadmap.md)')
  .option('-m, --model <model>', 'Model override for grill-me (default: opus)')
  .option('-d, --plan-dir <dir>', 'Target plan directory for spec.md and plan.md output')
  .option('-a, --auto', 'Auto mode — skip permission prompts')
  .action(executeGrillMePlanFast);
