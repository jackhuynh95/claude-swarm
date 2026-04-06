import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import ora from 'ora';
import chalk from 'chalk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateDocOptions {
  input:    string;
  context?: string;
  epics?:   number;
  dryRun?:  boolean;
  budget?:  number;
  timeout?: number;
  model?:   string;
  effort?:  string;
}

// ─── Input resolver ───────────────────────────────────────────────────────────

/** Resolve input: if starts with @, read file contents; otherwise return as-is. */
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

/** Convert topic string to kebab-case slug for filenames. */
function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ─── Claude subprocess runner ─────────────────────────────────────────────────

/** Spawn Claude with a plain prompt (no slash commands). Capture stdout as result. */
function spawnClaude(
  prompt: string,
  opts: { model?: string; effort?: string; budget?: number; timeout?: number },
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise(res => {
    const model = opts.model ?? 'claude-opus-4-5';
    const args = ['-p', prompt, '--model', model, '--output-format', 'text', '--dangerously-skip-permissions'];
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.budget) args.push('--max-budget-usd', String(opts.budget));

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
      res({
        success: !timedOut && code === 0,
        stdout,
        stderr: timedOut ? `Timed out after ${opts.timeout ?? 600}s` : stderr,
      });
    };

    proc.on('close', finish);
    proc.on('error', err => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      res({ success: false, stdout: '', stderr: err.message });
    });
  });
}

// ─── Build the generation prompt ──────────────────────────────────────────────

/** Build the prompt that generates a structured implementation roadmap doc. */
function buildPrompt(topic: string, context: string, epicHint: string): string {
  return `You are generating an implementation roadmap document for a software project.

Topic: ${topic}
${context ? `\nAdditional context:\n${context}\n` : ''}
${epicHint ? `\nConstraint: ${epicHint}\n` : ''}

Generate a comprehensive implementation roadmap in Markdown. Follow this exact structure:

1. **Title**: "# {Feature Name} — Implementation Roadmap"
2. **Metadata**: Date (today), Goal (one-line), Location (file paths)
3. **Problem section**: What exists now vs what we're building (with code/diagram comparison)
4. **Architecture section**: Mermaid diagram showing components and data flow
5. **Phases**: Each phase should have:
   - Phase number and name as H2 ("## Phase N — Name")
   - **Goal**: one-line description
   - **Task table**: numbered tasks with columns: #, Task, Status (all "Pending")
   - **Implementation details**: flow diagrams, code snippets, prompts, or config examples
   - **Model routing** if applicable (which AI model for which step)
6. **CLI Reference**: Example commands for using the feature
7. **Model Routing table**: Step | Model | Effort | Why
8. **Summary table**: Phase | What | Files | Tasks count

Important rules:
- Tasks should be numbered sequentially across ALL phases (not restarting per phase)
- Each phase should have 4-8 tasks
- Include concrete file paths (src/commands/*, etc.)
- Include mermaid diagrams for architecture
- Include code snippets and flow diagrams in phases
- Be specific about implementation details, not vague descriptions
- Total should be 30-60 tasks across all phases

Output ONLY the markdown content. No code fences wrapping the entire document.`;
}

// ─── Main: generate-doc pipeline ──────────────────────────────────────────────

/**
 * Generate an implementation roadmap doc and save to docs/implement-roadmap-{slug}.md.
 * Uses a plain prompt (no /ck: slash commands) to produce the doc directly.
 */
export async function generateDoc(opts: GenerateDocOptions): Promise<void> {
  const topic = await resolveInput(opts.input);
  const context = opts.context ? await resolveInput(opts.context) : '';
  const epicHint = opts.epics ? `Organize into exactly ${opts.epics} epics/phases.` : '';
  const slug = toSlug(topic);
  const outputPath = join(process.cwd(), 'docs', `implement-roadmap-${slug}.md`);

  console.log(chalk.cyan(`\n  Topic:  ${topic}`));
  console.log(chalk.cyan(`  Output: ${outputPath}\n`));

  if (opts.dryRun) {
    console.log(chalk.yellow('--- DRY RUN ---'));
    console.log(chalk.dim(`  Would spawn Claude (${opts.model ?? 'opus'}) to generate roadmap`));
    console.log(chalk.dim(`  Would save to: ${outputPath}`));
    return;
  }

  // Ensure docs/ directory exists
  const docsDir = join(process.cwd(), 'docs');
  if (!existsSync(docsDir)) await mkdir(docsDir, { recursive: true });

  // Check if file already exists
  if (existsSync(outputPath)) {
    console.log(chalk.yellow(`⚠ File already exists: ${outputPath}`));
    console.log(chalk.yellow('  Will overwrite with new generation.\n'));
  }

  const prompt = buildPrompt(topic, context, epicHint);
  const spinner = ora(`Generating roadmap doc (${opts.model ?? 'opus'})...`).start();

  const result = await spawnClaude(prompt, {
    model:   opts.model,
    effort:  opts.effort ?? 'high',
    budget:  opts.budget,
    timeout: opts.timeout,
  });

  if (!result.success) {
    spinner.fail(chalk.red('Generation failed'));
    if (result.stderr) console.error(chalk.dim(result.stderr.slice(0, 300)));
    throw new Error('generate-doc failed');
  }

  // Clean up output: remove wrapping code fences if Claude added them
  let content = result.stdout.trim();
  if (content.startsWith('```markdown')) {
    content = content.slice('```markdown'.length);
  } else if (content.startsWith('```md')) {
    content = content.slice('```md'.length);
  } else if (content.startsWith('```')) {
    content = content.slice(3);
  }
  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }
  content = content.trim();

  await writeFile(outputPath, content + '\n', 'utf-8');
  spinner.succeed(chalk.green(`Roadmap saved: ${outputPath}`));

  // Summary
  const phaseCount = (content.match(/^## Phase \d+/gm) || []).length;
  const taskCount = (content.match(/^\| \d+ \|/gm) || []).length;
  console.log(chalk.dim(`  ${phaseCount} phases, ${taskCount} tasks detected\n`));
}
