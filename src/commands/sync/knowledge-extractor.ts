import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureKnowledge } from './knowledge-writer.js';
import type { KnowledgeMetadata } from './knowledge-writer.js';
import { isInjectedNote } from './frontmatter-parser.js';
import type { ClassifiedIssue, PhaseResult } from '../watch/types.js';

const RECENT_MTIME_MS = 5 * 60 * 1000; // 5 minutes

/** Knowledge/ subdirs to scan when checking for already-promoted slugs. */
const KNOWLEDGE_SUBDIRS = ['Knowledge/Lessons', 'Knowledge/Patterns', 'Knowledge/Decisions'];

/**
 * Check if a note slug is already present in Knowledge/ subdirs.
 * Matches any file ending with `-{slug}.md` (date-prefix tolerant).
 */
async function isAlreadyPromoted(vaultPath: string, slug: string): Promise<boolean> {
  for (const subdir of KNOWLEDGE_SUBDIRS) {
    const dir = join(vaultPath, subdir);
    const files = await readdir(dir).catch(() => [] as string[]);
    if (files.some(f => f.endsWith(`-${slug}.md`) || f === `${slug}.md`)) return true;
  }
  return false;
}

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

      // Skip notes injected from second-brain (must never be re-promoted)
      if (isInjectedNote(content)) {
        console.log(`[knowledge-extractor] skip injected: ${file}`);
        continue;
      }

      const title = file.replace(/\.md$/, '');
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60).replace(/-$/, '');

      // Skip notes already promoted to Knowledge/ (prevent duplicate classification)
      if (await isAlreadyPromoted(vaultPath, slug)) {
        console.log(`[knowledge-extractor] skip already-promoted: ${slug}`);
        continue;
      }

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
