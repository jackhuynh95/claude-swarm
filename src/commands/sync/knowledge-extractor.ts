import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureKnowledge } from './knowledge-writer.js';
import type { KnowledgeMetadata } from './knowledge-writer.js';
import type { ClassifiedIssue, PhaseResult } from '../watch/types.js';

const RECENT_MTIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Scan Notes/ for files modified in the last 5 minutes and promote them to Knowledge/.
 * Called after journal-writer completes — journal may have written new notes.
 */
export async function extractFromRecentNotes(
  vaultPath: string,
  metadata: KnowledgeMetadata,
): Promise<void> {
  try {
    const notesDir = join(vaultPath, 'Notes');
    const files = await readdir(notesDir).catch(() => [] as string[]);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(notesDir, file);
      const s = await stat(filePath).catch(() => null);
      if (!s || now - s.mtimeMs > RECENT_MTIME_MS) continue;

      const content = await readFile(filePath, 'utf8').catch(() => null);
      if (!content) continue;

      const title = file.replace(/\.md$/, '');
      await captureKnowledge(vaultPath, { title, content }, metadata);
    }
  } catch {
    // best-effort — never block pipeline
  }
}

/**
 * Extract lesson candidates from failed/retried phases and feed to knowledge-writer.
 * Simple heuristic — no Claude call needed for this step.
 */
export async function extractFromRunResults(
  vaultPath: string,
  results: PhaseResult[],
  metadata: KnowledgeMetadata,
): Promise<void> {
  const failed = results.filter((r) => !r.success && r.error);
  if (failed.length === 0) return;

  try {
    const failureLines = failed
      .map((r) => `- **${r.phase}** failed: ${r.error}`)
      .join('\n');

    const content = `## Failure Pattern

Phases that failed during run for issue #${metadata.issue ?? 'unknown'}:

${failureLines}

## Lesson

Investigate these failure patterns to prevent recurrence in future runs.`;

    const title = `run-failure-${metadata.date}-issue-${metadata.issue ?? 'unknown'}`;
    await captureKnowledge(vaultPath, { title, content }, { ...metadata, sourcePhase: 'run-record' });
  } catch {
    // best-effort
  }
}

/**
 * Orchestrate knowledge extraction after post-ship pipeline completes.
 * Runs both extraction strategies — never throws.
 */
export async function extractKnowledge(
  vaultPath: string,
  classified: ClassifiedIssue,
  flowResults: PhaseResult[],
  postShipResults: PhaseResult[],
  repo: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  // repo is "owner/name" — take the name part
  const project = repo.includes('/') ? repo.split('/')[1]! : repo;

  const baseMetadata: KnowledgeMetadata = {
    issue: classified.issue.number,
    project,
    sourcePhase: 'journal',
    date: today,
  };

  // Extract from recently-written Notes/ (journal output)
  await extractFromRecentNotes(vaultPath, baseMetadata);

  // Extract lessons from failed pipeline phases
  await extractFromRunResults(
    vaultPath,
    [...flowResults, ...postShipResults],
    { ...baseMetadata, sourcePhase: 'run-record' },
  );
}
