// Injects relevant global/shared knowledge from second-brain into a project vault.
// Reverse of smart-pull: reads brain notes, filters by relevance, copies useful ones to project.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { filterByRelevance, MAX_BATCH_SIZE } from './relevance-filter.js';
import type { NoteInput } from './note-classifier.js';
import { parseFrontmatter, buildFrontmatter, hasFrontmatter, mergeFrontmatter } from './frontmatter-parser.js';
import { acquireCycleLock, releaseCycleLock } from './cycle-guard.js';

export interface SmartPushOptions {
  vaultPath: string;    // project vault root
  brainPath: string;    // shared second-brain root
  projectName: string;  // for frontmatter + skip logic
  context: string;      // task/issue context for relevance scoring
  dryRun?: boolean;     // log only, no writes
}

export interface SmartPushDetail {
  filename: string;
  action: 'injected' | 'skipped';
  reason: string;
  score?: number;
  targetPath?: string; // destination path in project vault (set on successful injection)
}

export interface SmartPushResult {
  injected: number;
  skipped: number;
  details: SmartPushDetail[];
}

const BRAIN_SCAN_DIRS = ['_lessons', '_patterns', '_decisions'];
const PROJECT_INJECT_DIR = 'Notes'; // inject into project Notes/

async function scanBrainDir(dirPath: string): Promise<NoteInput[]> {
  const notes: NoteInput[] = [];
  try {
    for (const entry of await readdir(dirPath)) {
      if (!entry.endsWith('.md')) continue;
      try { notes.push({ filename: entry, content: await readFile(join(dirPath, entry), 'utf8') }); } catch { /* skip */ }
    }
  } catch { /* dir missing */ }
  return notes;
}

async function getProjectFilenames(vaultPath: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    for (const e of await readdir(join(vaultPath, PROJECT_INJECT_DIR))) {
      if (e.endsWith('.md')) names.add(e.toLowerCase());
    }
  } catch { /* dir missing */ }
  return names;
}

function filterAlreadyInProject(
  notes: NoteInput[],
  projectFiles: Set<string>,
): { keep: NoteInput[]; skipped: SmartPushDetail[] } {
  const keep: NoteInput[] = [], skipped: SmartPushDetail[] = [];
  for (const note of notes) {
    if (projectFiles.has(note.filename.toLowerCase())) {
      skipped.push({ filename: note.filename, action: 'skipped', reason: 'already in project vault' });
    } else {
      keep.push(note);
    }
  }
  return { keep, skipped };
}

function filterBySourceProject(
  notes: NoteInput[],
  projectName: string,
): { keep: NoteInput[]; skipped: SmartPushDetail[] } {
  const keep: NoteInput[] = [], skipped: SmartPushDetail[] = [];
  for (const note of notes) {
    const fm = parseFrontmatter(note.content);
    if (fm['source-project'] === projectName) {
      skipped.push({ filename: note.filename, action: 'skipped', reason: 'originated from this project' });
    } else {
      keep.push(note);
    }
  }
  return { keep, skipped };
}

/**
 * Scan second-brain, filter by relevance to context, inject useful notes into project vault.
 * Respects cycle guard — denies if opposing pull lock is active. Never throws.
 */
export async function smartPush(opts: SmartPushOptions): Promise<SmartPushResult> {
  const { vaultPath, brainPath, projectName, context, dryRun = false } = opts;
  const details: SmartPushDetail[] = [];

  const locked = await acquireCycleLock(vaultPath, 'push');
  if (!locked) {
    console.log('[smart-push] denied by cycle guard — pull lock active');
    return { injected: 0, skipped: 0, details: [{ filename: '*', action: 'skipped', reason: 'cycle guard denied' }] };
  }

  try {
    // Scan all brain dirs
    const allNotes: NoteInput[] = [];
    for (const dir of BRAIN_SCAN_DIRS) {
      allNotes.push(...await scanBrainDir(join(brainPath, dir)));
    }

    if (allNotes.length === 0) {
      console.log('[smart-push] no notes found in second-brain');
      return { injected: 0, skipped: 0, details };
    }

    const projectFiles = await getProjectFilenames(vaultPath);

    // Filter pipeline: already-in-project → source-project → relevance
    const { keep: afterProject, skipped: skippedProject } = filterAlreadyInProject(allNotes, projectFiles);
    details.push(...skippedProject);

    const { keep: toScore, skipped: skippedSource } = filterBySourceProject(afterProject, projectName);
    details.push(...skippedSource);

    if (toScore.length === 0) {
      console.log('[smart-push] all notes filtered before relevance scoring');
      return { injected: 0, skipped: details.length, details };
    }

    // Batch relevance filtering (max 15 per call)
    const relevanceMap = new Map<string, { relevant: boolean; reason: string; score: number }>();
    for (let i = 0; i < toScore.length; i += MAX_BATCH_SIZE) {
      const chunk = toScore.slice(i, i + MAX_BATCH_SIZE);
      const filterResult = await filterByRelevance(context, chunk);
      for (const r of filterResult.results) {
        relevanceMap.set(r.filename, { relevant: r.relevant, reason: r.reason, score: r.score });
      }
    }

    const injectDir = join(vaultPath, PROJECT_INJECT_DIR);
    const now = new Date().toISOString();
    const injectionFields: Record<string, string> = {
      'injected-from': 'second-brain',
      // Quote value to handle colons in context strings (e.g. "feat: add auth")
      'injected-for': `"${context.slice(0, 100).replace(/"/g, "'")}"`,
      'synced-at': now,
    };

    for (const note of toScore) {
      const rel = relevanceMap.get(note.filename);
      if (!rel || !rel.relevant) {
        details.push({
          filename: note.filename,
          action: 'skipped',
          reason: rel?.reason ?? 'not scored',
          score: rel?.score,
        });
        continue;
      }

      const finalContent = hasFrontmatter(note.content)
        ? mergeFrontmatter(note.content, injectionFields)
        : buildFrontmatter({
            date: now.slice(0, 10),
            'injected-from': 'second-brain',
            'synced-at': now,
          }) + note.content;

      const targetPath = join(injectDir, note.filename);

      if (!dryRun) {
        try {
          await mkdir(injectDir, { recursive: true });
          await writeFile(targetPath, finalContent, 'utf8');
        } catch (err) {
          console.error(`[smart-push] write error: ${note.filename}`, err);
          details.push({ filename: note.filename, action: 'skipped', reason: `write error: ${String(err)}` });
          continue;
        }
      }

      console.log(`[smart-push] ${dryRun ? '(dry-run) ' : ''}injected: ${note.filename} [score=${rel.score}]`);
      details.push({
        filename: note.filename,
        action: 'injected',
        reason: rel.reason,
        score: rel.score,
        targetPath,
      });
    }
  } finally {
    await releaseCycleLock(vaultPath);
  }

  return {
    injected: details.filter(d => d.action === 'injected').length,
    skipped: details.filter(d => d.action === 'skipped').length,
    details,
  };
}
