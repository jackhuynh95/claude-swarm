import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import type { VerifyVerdict } from './verifier.js';

export interface JournalConfig {
  repo: string;
  autoMode: boolean;
  vaultPath: string;     // path to obsidian-vault/ directory
  cwd?: string;
}

/**
 * Obsidian vault journal writer — best-effort, never blocks pipeline.
 * Writes daily entry and extracts notable lessons to Notes/.
 */
export async function executeJournal(
  classified: ClassifiedIssue,
  config: JournalConfig,
  flowResults: PhaseResult[],
  verifyVerdict?: VerifyVerdict,
): Promise<PhaseResult> {
  try {
    const prompt = buildJournalPrompt(classified, config.vaultPath, flowResults, verifyVerdict);

    const result = await invokeClaudePhase(
      prompt, 'journal', undefined, config.autoMode, config.cwd,
    );
    return result;
  } catch (err) {
    // Never block pipeline
    return {
      phase: 'journal',
      success: false,
      error: err instanceof Error ? err.message : 'unknown error',
      durationMs: 0,
    };
  }
}

function buildJournalPrompt(
  classified: ClassifiedIssue,
  vaultPath: string,
  flowResults: PhaseResult[],
  verifyVerdict?: VerifyVerdict,
): string {
  const { issue, issueType } = classified;
  const today = formatDate(new Date());
  const now = formatTime(new Date());
  const totalMs = flowResults.reduce((sum, r) => sum + r.durationMs, 0);
  const duration = formatDuration(totalMs);

  const prUrl = flowResults
    .flatMap((r) => r.artifacts ?? [])
    .find((a) => a.includes('pull')) ?? 'none';

  const failedPhases = flowResults
    .filter((r) => !r.success && r.error)
    .map((r) => `- ${r.phase}: ${r.error}`);
  const errorsSection = failedPhases.length > 0 ? failedPhases.join('\n') : 'None';

  const phasesSummary = flowResults
    .map((r) => `| ${r.phase} | ${r.success ? 'ok' : 'fail'} | ${formatDuration(r.durationMs)} | ${r.error ?? '—'} |`)
    .join('\n');

  return `Write a daily journal entry for the obsidian vault.

Vault path: ${vaultPath}
Daily file: ${vaultPath}/Daily/${today}.md

## Run Data
Issue: #${issue.number} — ${issue.title}
Type: ${issueType}
Verdict: ${verifyVerdict ?? 'N/A'}
PR: ${prUrl}
Duration: ${duration}

Phase results:
| Phase | Status | Duration | Error |
|-------|--------|----------|-------|
${phasesSummary}

Failed phase details:
${errorsSection}

## Instructions

1. Read ${vaultPath}/Daily/${today}.md if it exists, count the number of existing "## Dev Session" headings (call that N), then append a new section as Dev Session N+1.

2. If the file does NOT exist, create it with this frontmatter first:
---
date: ${today}
tags: [daily, claude-swarm]
projects: [claude-swarm]
---

3. Append (or write) the following structured section — fill in [brackets] using the run data above:

## Dev Session [N+1] — ${now}

### What Was Done
- Issue #${issue.number}: ${issue.title} (${issueType})
- Verdict: ${verifyVerdict ?? 'N/A'}
- PR: ${prUrl}
- Duration: ${duration}

### Decisions Made
[List any architectural or approach decisions inferred from the phases — e.g. model choice, flow branching, retry strategy. If none evident, write "None recorded."]

### Lessons Learned
[Non-obvious insights from errors, retries, or unexpected phase behavior. Be specific — "X failed because Y" is more useful than "there was an error". If no issues, write "Run clean."]

### Unresolved
[Items needing follow-up: failed phases, partial verdicts, open questions. If none, write "None."]

4. If you identified a reusable lesson or pattern (something that would help future runs), ALSO create a note:
   File: ${vaultPath}/Notes/{descriptive-kebab-name}.md
   Frontmatter: date, tags: [lesson, claude-swarm] (or [pattern, claude-swarm])
   Body: the lesson/pattern with a [[${today}]] wikilink back to today's daily note.
   Only create a Notes file if the lesson is genuinely reusable — skip if the run was routine.`;
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
