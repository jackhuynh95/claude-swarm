// Promotes proven project vault notes to shared second-brain.
// Scans vault subdirs, classifies via haiku, copies reusable ones with provenance.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyNotes, type NoteInput } from './note-classifier.js';
import { parseFrontmatter, buildFrontmatter, hasFrontmatter, isInjectedNote } from './frontmatter-parser.js';
import { acquireCycleLock, releaseCycleLock } from './cycle-guard.js';

export interface SmartPullOptions {
  vaultPath: string;   // project vault root
  brainPath: string;   // shared second-brain root
  projectName: string; // classifier context hint
  dryRun?: boolean;    // log only, no writes
}
export interface SmartPullDetail {
  filename: string;
  action: 'promoted' | 'skipped';
  reason: string;
  category?: string;
  targetPath?: string;
}
export interface SmartPullResult { promoted: number; skipped: number; details: SmartPullDetail[] }

const VAULT_SCAN_DIRS = ['Daily', 'Notes', 'Decisions', 'Knowledge/Lessons', 'Knowledge/Patterns', 'Knowledge/Decisions'];
const BRAIN_DIR: Record<string, string | null> = {
  lesson: '_lessons', pattern: '_patterns', decision: '_decisions', foundation: '_lessons', 'project-specific': null,
};
const BRAIN_CHECK_DIRS = ['_lessons', '_patterns', '_decisions'];

async function scanDir(dirPath: string): Promise<NoteInput[]> {
  const notes: NoteInput[] = [];
  try {
    for (const entry of await readdir(dirPath)) {
      if (!entry.endsWith('.md')) continue;
      try { notes.push({ filename: entry, content: await readFile(join(dirPath, entry), 'utf8') }); } catch { /* skip */ }
    }
  } catch { /* dir missing */ }
  return notes;
}

async function getBrainFilenames(brainPath: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const dir of BRAIN_CHECK_DIRS) {
    try {
      for (const e of await readdir(join(brainPath, dir))) {
        if (e.endsWith('.md')) names.add(e.toLowerCase());
      }
    } catch { /* dir missing */ }
  }
  return names;
}

function stripDatePrefix(f: string): string { return f.replace(/^\d{4}-\d{2}-\d{2}-/, ''); }

/** Inject provenance fields before the closing --- of an existing frontmatter block. */
function mergeFrontmatter(content: string, fields: Record<string, string>): string {
  const closeIdx = content.indexOf('\n---', 4);
  if (closeIdx === -1) return content;
  const additions = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${content.slice(0, closeIdx)}\n${additions}${content.slice(closeIdx)}`;
}

function filterAlreadyInBrain(notes: NoteInput[], brain: Set<string>): { keep: NoteInput[]; skipped: SmartPullDetail[] } {
  const keep: NoteInput[] = [], skipped: SmartPullDetail[] = [];
  for (const note of notes) {
    const slug = stripDatePrefix(note.filename).toLowerCase();
    const inBrain = brain.has(note.filename.toLowerCase()) || [...brain].some(f => stripDatePrefix(f) === slug);
    if (inBrain) skipped.push({ filename: note.filename, action: 'skipped', reason: 'already in brain' });
    else keep.push(note);
  }
  return { keep, skipped };
}

function filterByFrontmatter(notes: NoteInput[], brain: Set<string>): { keep: NoteInput[]; skipped: SmartPullDetail[] } {
  const keep: NoteInput[] = [], skipped: SmartPullDetail[] = [];
  for (const note of notes) {
    if (isInjectedNote(note.content)) {
      skipped.push({ filename: note.filename, action: 'skipped', reason: 'injected from brain' }); continue;
    }
    const fm = parseFrontmatter(note.content);
    if (fm['synced-at'] && brain.has(note.filename.toLowerCase())) {
      skipped.push({ filename: note.filename, action: 'skipped', reason: 'already synced' }); continue;
    }
    keep.push(note);
  }
  return { keep, skipped };
}

/**
 * Scan project vault, classify notes, promote reusable ones to shared second-brain.
 * Respects cycle guard — denies if opposing lock is active. Never throws.
 */
export async function smartPull(opts: SmartPullOptions): Promise<SmartPullResult> {
  const { vaultPath, brainPath, projectName, dryRun = false } = opts;
  const details: SmartPullDetail[] = [];

  const locked = await acquireCycleLock(vaultPath, 'pull');
  if (!locked) {
    console.log('[smart-pull] denied by cycle guard — push lock active');
    return { promoted: 0, skipped: 0, details: [{ filename: '*', action: 'skipped', reason: 'cycle guard denied' }] };
  }

  try {
    const allNotes: NoteInput[] = [];
    for (const sub of VAULT_SCAN_DIRS) allNotes.push(...await scanDir(join(vaultPath, sub)));
    const brainFilenames = await getBrainFilenames(brainPath);

    const { keep: afterBrain, skipped: skippedBrain } = filterAlreadyInBrain(allNotes, brainFilenames);
    details.push(...skippedBrain);
    const { keep: toClassify, skipped: skippedFm } = filterByFrontmatter(afterBrain, brainFilenames);
    details.push(...skippedFm);

    if (toClassify.length === 0) {
      console.log('[smart-pull] nothing to classify');
      return { promoted: 0, skipped: details.length, details };
    }

    const classResult = await classifyNotes(toClassify, { projectName });
    const classMap = new Map(classResult.classifications.map(c => [c.filename, c]));
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    for (const note of toClassify) {
      const cls = classMap.get(note.filename);
      if (!cls || cls.action === 'skip' || cls.category === 'project-specific') {
        details.push({ filename: note.filename, action: 'skipped', reason: cls?.reason ?? 'unclassified' }); continue;
      }
      const dir = BRAIN_DIR[cls.category];
      if (!dir) {
        details.push({ filename: note.filename, action: 'skipped', reason: 'no brain dir for category' }); continue;
      }

      const targetDir = join(brainPath, dir);
      const targetPath = join(targetDir, note.filename);
      const provenance: Record<string, string> = {
        'source-project': projectName, 'promoted-date': today, 'synced-at': now,
        'classified-by': 'haiku', 'classification-reason': `"${cls.reason.replace(/"/g, "'")}"`,
      };
      const finalContent = hasFrontmatter(note.content)
        ? mergeFrontmatter(note.content, provenance)
        : buildFrontmatter({ date: today, category: cls.category, 'source-project': projectName,
            'promoted-date': today, 'synced-at': now, 'classified-by': 'haiku',
            'classification-reason': cls.reason }) + note.content;

      if (!dryRun) {
        try {
          await mkdir(targetDir, { recursive: true });
          await writeFile(targetPath, finalContent, 'utf8');
        } catch (err) {
          console.error(`[smart-pull] write error: ${note.filename}`, err);
          details.push({ filename: note.filename, action: 'skipped', reason: `write error: ${String(err)}` }); continue;
        }
      }
      console.log(`[smart-pull] ${dryRun ? '(dry-run) ' : ''}promoted: ${dir}/${note.filename} [${cls.category}]`);
      details.push({ filename: note.filename, action: 'promoted', reason: cls.reason, category: cls.category, targetPath });
    }
  } finally {
    await releaseCycleLock(vaultPath);
  }

  return {
    promoted: details.filter(d => d.action === 'promoted').length,
    skipped: details.filter(d => d.action === 'skipped').length,
    details,
  };
}
