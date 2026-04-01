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

  const errors = flowResults
    .filter((r) => !r.success && r.error)
    .map((r) => `${r.phase}: ${r.error}`)
    .join(', ') || 'none';

  const phasesSummary = flowResults
    .map((r) => `${r.phase}(${r.success ? 'ok' : 'fail'})`)
    .join(', ');

  return `Write a daily journal entry for the obsidian vault.

Vault path: ${vaultPath}
Daily file: ${vaultPath}/Daily/${today}.md

Issue: #${issue.number} — ${issue.title} (${issueType})
Verdict: ${verifyVerdict ?? 'N/A'}
PR: ${prUrl}
Duration: ${duration}
Phases completed: ${phasesSummary}
Errors: ${errors}

Format the entry as:
## ${now} — Issue #${issue.number}: ${issue.title}
- **Type**: ${issueType}
- **Verdict**: ${verifyVerdict ?? 'N/A'}
- **PR**: ${prUrl}
- **Duration**: ${duration}
- **Summary**: [1-2 sentences on what was done]
- **Lessons**: [any non-obvious insights, or "none"]

If the daily file exists, APPEND to it. If not, create with frontmatter:
---
date: ${today}
tags: [daily, claude-swarm]
---

If you identify reusable lessons or patterns, also create a note in:
${vaultPath}/Notes/{descriptive-name}.md
with [[wikilinks]] back to the daily entry.`;
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
