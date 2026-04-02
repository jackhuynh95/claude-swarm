import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ora from 'ora';
import chalk from 'chalk';

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

/**
 * Convert a topic string to a URL-safe kebab-case slug (max 60 chars).
 */
function toSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Build the Claude prompt that requests a structured roadmap markdown.
 */
function buildRoadmapPrompt(opts: { topic: string; context?: string; epics?: number }): string {
  const epicHint = opts.epics
    ? `Organize into exactly ${opts.epics} epics/phases.`
    : 'Organize into a sensible number of epics/phases (typically 3–8).';

  const contextSection = opts.context
    ? `\n\n## Additional Context\n\n${opts.context}`
    : '';

  return `You are a senior software architect. Generate a detailed implementation roadmap for the following topic.

## Topic

${opts.topic}${contextSection}

## Instructions

${epicHint}

Output ONLY valid markdown following this exact structure:

\`\`\`
# {Title} Implementation Roadmap

**Date**: {YYYY-MM-DD}
**Goal**: {One-sentence goal}

---

## Architecture Overview

{ASCII or markdown file tree showing key files/directories}

---

## Phase 1 — {Epic Name}

| # | Task | Status |
|---|------|--------|
| 1.1 | {Task description} | Pending |
| 1.2 | {Task description} | Pending |

## Phase 2 — {Epic Name}

| # | Task | Status |
|---|------|--------|
| 2.1 | {Task description} | Pending |

{...repeat for each phase...}

---

## Summary

| Phase | Epic | Status | Priority |
|-------|------|--------|----------|
| 1 | {Epic Name} | Pending | High |
| 2 | {Epic Name} | Pending | High |
\`\`\`

Rules:
- Every task must be concrete and actionable
- Use "Pending" as the initial status for all tasks
- Include file paths and component names where relevant
- No prose outside the markdown structure
- Output raw markdown, no code fences wrapping the entire document`;
}

/**
 * Spawn Claude CLI subprocess and return stdout.
 * Uses opus model with dangerously-skip-permissions (read-only brainstorm).
 * Timeout: 600s.
 */
async function spawnClaudeForRoadmap(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', 'claude-opus-4-5',
      '--output-format', 'text',
      '--dangerously-skip-permissions',
    ];

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => proc.kill('SIGKILL'), 5_000);
    }, 600_000);

    proc.on('close', (code) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);

      if (timedOut) return reject(new Error('Claude timed out after 600s'));
      if (code !== 0) return reject(new Error(`Claude exited ${code}: ${stderr.trim()}`));
      resolve(stdout);
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      reject(err);
    });
  });
}

export interface GenerateRoadmapOptions {
  input: string;
  context?: string;
  epics?: number;
  dryRun?: boolean;
  outputDir?: string;
}

/**
 * Main roadmap generation function.
 * Resolves input, spawns Claude opus, writes roadmap markdown to docs/.
 */
export async function generateRoadmap(opts: GenerateRoadmapOptions): Promise<{ roadmapPath: string; content: string }> {
  const topic = await resolveInput(opts.input);
  const context = opts.context ? await resolveInput(opts.context) : undefined;

  const prompt = buildRoadmapPrompt({ topic, context, epics: opts.epics });

  const spinner = ora('Generating roadmap (opus)...').start();
  let content: string;

  try {
    content = await spawnClaudeForRoadmap(prompt);
    spinner.succeed(chalk.green('Roadmap generated'));
  } catch (err) {
    spinner.fail(chalk.red('Roadmap generation failed'));
    throw err;
  }

  if (opts.dryRun) {
    console.log(chalk.yellow('\n--- DRY RUN OUTPUT ---\n'));
    console.log(content);
    return { roadmapPath: '', content };
  }

  const slug = toSlug(topic.slice(0, 120)); // use first 120 chars of topic for slug
  const outputDir = resolve(opts.outputDir ?? 'docs');
  await mkdir(outputDir, { recursive: true });

  const roadmapPath = join(outputDir, `implement-roadmap-${slug}.md`);
  await writeFile(roadmapPath, content, 'utf-8');

  console.log(chalk.green(`✓ Roadmap saved to: ${roadmapPath}`));
  return { roadmapPath, content };
}
