import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ora from 'ora';
import chalk from 'chalk';

// ─── Model routing: generate step → claude model ─────────────────────────────

const MODEL_MAP_GENERATE = {
  brainstorm: 'claude-opus-4-6',    // deep creative thinking for scope exploration
  plan:       'claude-opus-4-6',    // architectural reasoning for full roadmap
  scenario:   'claude-sonnet-4-6',  // BDD test case generation per epic
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateRoadmapOptions {
  input:      string;
  context?:   string;
  epics?:     number;
  dryRun?:    boolean;
  outputDir?: string;
  budget?:    number;
  timeout?:   number;
}

// ─── Input resolver ───────────────────────────────────────────────────────────

/**
 * Resolve input: if starts with @, read file contents; otherwise return as-is.
 * Truncates file contents at 50K chars to avoid context overflow.
 */
async function resolveInput(input: string): Promise<string> {
  if (!input.startsWith('@')) return input;

  const filePath = resolve(input.slice(1));
  const content = await readFile(filePath, 'utf-8');
  if (content.length > 50_000) {
    console.warn(chalk.yellow(`⚠ Input file truncated to 50K chars (was ${content.length})`));
    return content.slice(0, 50_000);
  }
  return content;
}

// ─── Claude subprocess runner ─────────────────────────────────────────────────

/**
 * Spawn a Claude subprocess with a slash command prompt.
 * Returns success/failure result.
 */
function spawnClaudeStep(
  prompt: string,
  opts: { model: string; budget?: number; timeout?: number },
): Promise<{ success: boolean; stderr: string }> {
  return new Promise(resolve => {
    const args = ['-p', prompt, '--model', opts.model, '--output-format', 'text', '--dangerously-skip-permissions'];
    if (opts.budget) args.push('--max-budget-usd', String(opts.budget));

    const proc = spawn('claude', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '', timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

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
        success: !timedOut && code === 0,
        stderr:  timedOut ? `Timed out after ${opts.timeout ?? 600}s` : stderr,
      });
    };

    proc.on('close', finish);
    proc.on('error', err => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ success: false, stderr: err.message });
    });
  });
}

// ─── Main generation pipeline ─────────────────────────────────────────────────

/**
 * Generate a roadmap using a 3-step VividKit pipeline:
 *   1. /ck:brainstorm — explore scope and identify features/epics
 *   2. /ck:plan --hard — generate full implementation roadmap with deep analysis
 *   3. /ck:scenario — generate BDD test scenarios per epic
 */
export async function generateRoadmap(opts: GenerateRoadmapOptions): Promise<void> {
  const topic = await resolveInput(opts.input);
  const contextSection = opts.context ? ` Context: ${await resolveInput(opts.context)}` : '';
  const epicHint = opts.epics ? ` Organize into exactly ${opts.epics} epics.` : '';
  const subject = `${topic}${contextSection}${epicHint}`.slice(0, 500); // cap prompt length

  if (opts.dryRun) {
    console.log(chalk.yellow('\n--- DRY RUN: would run 3-step generate pipeline ---'));
    console.log(chalk.dim(`  1. /ck:brainstorm Analyze repo and identify features/epics for: ${subject}`));
    console.log(chalk.dim(`  2. /ck:plan --hard Generate full implementation roadmap for: ${subject}`));
    console.log(chalk.dim(`  3. /ck:scenario Generate BDD test scenarios for each epic in the roadmap`));
    return;
  }

  const stepOpts = { budget: opts.budget, timeout: opts.timeout };

  // Step 1: Brainstorm — explore scope and clarify ambiguity
  const spinner1 = ora('Brainstorming scope (opus)...').start();
  const r1 = await spawnClaudeStep(
    `/ck:brainstorm Analyze repo and identify features/epics for: ${subject}`,
    { model: MODEL_MAP_GENERATE.brainstorm, ...stepOpts },
  );
  if (r1.success) {
    spinner1.succeed(chalk.green('Brainstorm complete'));
  } else {
    spinner1.fail(chalk.red('Brainstorm failed'));
    if (r1.stderr) console.error(chalk.dim(r1.stderr.slice(0, 200)));
    throw new Error('generate pipeline failed at brainstorm step');
  }

  // Step 2: Plan --hard — generate full roadmap with deep analysis
  const spinner2 = ora('Generating roadmap with /ck:plan --hard (opus)...').start();
  const r2 = await spawnClaudeStep(
    `/ck:plan --hard Generate implementation roadmap for: ${subject}`,
    { model: MODEL_MAP_GENERATE.plan, ...stepOpts },
  );
  if (r2.success) {
    spinner2.succeed(chalk.green('Roadmap generated'));
  } else {
    spinner2.fail(chalk.red('Roadmap generation failed'));
    if (r2.stderr) console.error(chalk.dim(r2.stderr.slice(0, 200)));
    throw new Error('generate pipeline failed at plan step');
  }

  // Step 3: Scenario — generate BDD test cases per epic
  const spinner3 = ora('Generating test scenarios with /ck:scenario (sonnet)...').start();
  const r3 = await spawnClaudeStep(
    `/ck:scenario Generate BDD test scenarios for each epic in the roadmap`,
    { model: MODEL_MAP_GENERATE.scenario, ...stepOpts },
  );
  if (r3.success) {
    spinner3.succeed(chalk.green('Test scenarios generated'));
  } else {
    spinner3.fail(chalk.red('Scenario generation failed'));
    if (r3.stderr) console.error(chalk.dim(r3.stderr.slice(0, 200)));
    throw new Error('generate pipeline failed at scenario step');
  }

  console.log(chalk.green('\n✓ Generate pipeline complete: brainstorm → roadmap → scenarios'));
}
