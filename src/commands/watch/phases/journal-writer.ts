import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import type { VerifyVerdict } from './verifier.js';

export interface JournalConfig {
  repo: string;
  autoMode: boolean;
  vaultPath: string;     // path to obsidian-vault/ directory
  cwd?: string;
}

/** Minimal issue info that journal-writer actually needs — satisfies both watcher and builder. */
export interface JournalIssueContext {
  number: number;
  title: string;
  type: string;          // issueType or "task"
}

/** Minimal step result for journal context — both PhaseResult and builder StepResult can map to this. */
export interface JournalStepSummary {
  phase: string;
  success: boolean;
  durationMs: number;
  output?: string;
  error?: string;
  artifacts?: string[];
}

/**
 * Obsidian vault journal writer — best-effort, never blocks pipeline.
 * Delegates narrative to /2nd-brain:obsidian-journal skill; falls back to inline prompt if unavailable.
 *
 * Watcher entry point — wraps ClassifiedIssue + PhaseResult[] into the shared path.
 */
export async function executeJournal(
  classified: ClassifiedIssue,
  config: JournalConfig,
  flowResults: PhaseResult[],
  verifyVerdict?: VerifyVerdict,
): Promise<PhaseResult> {
  const issueCtx: JournalIssueContext = {
    number: classified.issue.number,
    title: classified.issue.title,
    type: classified.issueType,
  };
  const steps: JournalStepSummary[] = flowResults.map(r => ({
    phase: r.phase,
    success: r.success,
    durationMs: r.durationMs,
    output: r.output,
    error: r.error,
    artifacts: r.artifacts,
  }));
  return writeJournal(issueCtx, config, steps, verifyVerdict);
}

/**
 * Builder entry point — accepts lightweight types without watcher dependencies.
 * Best-effort, never blocks pipeline.
 */
export async function executeBuilderJournal(
  issueCtx: JournalIssueContext,
  config: JournalConfig,
  steps: JournalStepSummary[],
  verdict?: string,
): Promise<void> {
  try {
    await writeJournal(issueCtx, config, steps, verdict);
  } catch {
    // Never block builder pipeline
  }
}

/**
 * Shared journal-writing core used by both watcher and builder.
 */
async function writeJournal(
  issueCtx: JournalIssueContext,
  config: JournalConfig,
  steps: JournalStepSummary[],
  verdict?: string,
): Promise<PhaseResult> {
  try {
    const runContext = buildRunContext(issueCtx, config.vaultPath, steps, verdict);

    // Try skill-based narrative first
    const skillPrompt = buildSkillPrompt(config.vaultPath, runContext);
    const result = await invokeClaudePhase(
      skillPrompt, 'journal', undefined, undefined, config.autoMode, config.cwd,
    );

    // If skill invocation failed (e.g. skill not installed), fall back to inline prompt
    if (!result.success) {
      const fallbackPrompt = buildFallbackPrompt(issueCtx, config.vaultPath, steps, verdict, runContext);
      return await invokeClaudePhase(
        fallbackPrompt, 'journal', undefined, undefined, config.autoMode, config.cwd,
      );
    }

    return result;
  } catch (err) {
    return {
      phase: 'journal',
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
      durationMs: 0,
    };
  }
}

/** Shared run context string used by both skill and fallback prompts. */
function buildRunContext(
  issueCtx: JournalIssueContext,
  vaultPath: string,
  steps: JournalStepSummary[],
  verdict?: string,
): string {
  const today = formatDate(new Date());
  const totalMs = steps.reduce((sum, r) => sum + r.durationMs, 0);

  const prUrl = steps
    .flatMap((r) => r.artifacts ?? [])
    .find((a) => a.includes('pull')) ?? 'none';

  const debriefOutput = steps.find(r => r.phase === 'debrief')?.output ?? '';
  const debriefSection = debriefOutput
    ? `\nDebrief (spec vs built):\n${debriefOutput.slice(0, 2000)}`
    : '';

  const failedPhases = steps
    .filter((r) => !r.success && r.error)
    .map((r) => `- ${r.phase}: ${r.error}`);

  const phasesSummary = steps
    .map((r) => `| ${r.phase} | ${r.success ? 'ok' : 'fail'} | ${formatDuration(r.durationMs)} | ${r.error ?? '—'} |`)
    .join('\n');

  return `Issue: #${issueCtx.number} — ${issueCtx.title}
Type: ${issueCtx.type}
Verdict: ${verdict ?? 'N/A'}
PR: ${prUrl}
Duration: ${formatDuration(totalMs)}
Date: ${today}
Vault: ${vaultPath}

Phase results:
| Phase | Status | Duration | Error |
|-------|--------|----------|-------|
${phasesSummary}

Failed phases:
${failedPhases.length > 0 ? failedPhases.join('\n') : 'None'}
${debriefSection}`;
}

/**
 * Skill-based prompt: delegates narrative writing to /2nd-brain:obsidian-journal.
 * Vault path override tells the skill to write to the pipeline's vault, not the default project-local one.
 */
function buildSkillPrompt(
  vaultPath: string,
  runContext: string,
): string {
  return `/2nd-brain:obsidian-journal Write journal entry for automated pipeline run.

IMPORTANT: Use vault root "${vaultPath}" instead of the default "obsidian-vault/".
Write daily note to: ${vaultPath}/Daily/
Project: claude-swarm

${runContext}

Focus on: decisions made, lessons learned, unresolved items. Extract reusable lessons if any.`;
}

/**
 * Fallback prompt when /2nd-brain:obsidian-journal skill is unavailable.
 */
function buildFallbackPrompt(
  issueCtx: JournalIssueContext,
  vaultPath: string,
  steps: JournalStepSummary[],
  verdict: string | undefined,
  runContext: string,
): string {
  const today = formatDate(new Date());
  const now = formatTime(new Date());
  const totalMs = steps.reduce((sum, r) => sum + r.durationMs, 0);

  const prUrl = steps
    .flatMap((r) => r.artifacts ?? [])
    .find((a) => a.includes('pull')) ?? 'none';

  return `Write a daily journal entry for the obsidian vault.

Vault path: ${vaultPath}
Daily file: ${vaultPath}/Daily/${today}.md

## Run Data
${runContext}

## Instructions

1. Read ${vaultPath}/Daily/${today}.md if it exists, count existing "## Dev Session" headings (call that N), then append as Dev Session N+1.

2. If the file does NOT exist, create it with frontmatter:
---
date: ${today}
tags: [daily, claude-swarm]
projects: [claude-swarm]
---

3. Append the following structured section:

## Dev Session [N+1] — ${now}

### What Was Done
- Issue #${issueCtx.number}: ${issueCtx.title} (${issueCtx.type})
- Verdict: ${verdict ?? 'N/A'}
- PR: ${prUrl}
- Duration: ${formatDuration(totalMs)}

### Decisions Made
[List architectural or approach decisions from the phases. If none evident, write "None recorded."]

### Lessons Learned
[Non-obvious insights from errors, retries, or unexpected behavior. Be specific. If clean run, write "Run clean."]

### Unresolved
[Items needing follow-up. If none, write "None."]

4. If a reusable lesson or pattern emerged, also create:
   File: ${vaultPath}/Notes/{descriptive-kebab-name}.md
   Frontmatter: date, tags: [lesson, claude-swarm]
   Body: lesson with [[${today}]] wikilink back to daily note.
   Only create if genuinely reusable — skip if routine.`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
