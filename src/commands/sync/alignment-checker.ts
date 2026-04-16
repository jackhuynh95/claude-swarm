// Detects drift between project vault notes and second-brain notes.
// Classifies matched pairs: aligned | outdated | contradicting | superseded.
// Optional --auto-update copies newer version, backs up old as .bak.

import Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseFrontmatter, mergeFrontmatter } from './frontmatter-parser.js';

// --- Types ---

export interface AlignmentCheckOptions {
  vaultPath: string;    // project vault root
  brainPath: string;    // shared second-brain root
  projectName: string;  // for logging
  dryRun?: boolean;
  autoUpdate?: boolean; // copy newer version, backup old
}

export interface AlignmentDetail {
  filename: string;
  status: 'aligned' | 'outdated' | 'contradicting' | 'superseded';
  direction: 'project-to-brain' | 'brain-to-project' | 'manual-review' | 'none';
  reason: string;
  projectPath: string;
  brainPath: string;
  projectDate?: string;
  brainDate?: string;
  updated?: boolean; // true if auto-update applied
}

export interface AlignmentResult {
  total: number;
  aligned: number;
  drifted: number;
  details: AlignmentDetail[];
}

// --- Constants ---

const VAULT_SCAN_DIRS = ['Notes', 'Knowledge/Lessons', 'Knowledge/Patterns', 'Knowledge/Decisions', 'Decisions'];
const BRAIN_SCAN_DIRS = ['_lessons', '_patterns', '_decisions'];
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250514';
const MAX_NOTE_CHARS = 1500;
const MAX_BATCH_SIZE = 10;
const MAX_TOKENS = 1024;

// --- Zod schemas ---

const AlignmentItemSchema = z.object({
  filename: z.string(),
  status: z.enum(['aligned', 'outdated', 'contradicting', 'superseded']),
  direction: z.enum(['project-to-brain', 'brain-to-project', 'manual-review', 'none']),
  reason: z.string(),
});

const AlignmentBatchSchema = z.object({
  results: z.array(AlignmentItemSchema),
});

const SYSTEM_PROMPT = `You are a knowledge note alignment checker.
Given pairs of notes (project version vs brain version), classify each pair:
- "aligned": content is essentially the same, no action needed
- "outdated": one version is clearly older/less complete than the other
- "contradicting": versions contain conflicting information
- "superseded": one version has been completely replaced by new content

For outdated/superseded, specify direction:
- "project-to-brain": project version is newer, should update brain
- "brain-to-project": brain version is newer, should update project
For contradicting: always "manual-review"
For aligned: always "none"

Output JSON: { "results": [{ "filename", "status", "direction", "reason" }] }`;

// --- Scan helpers ---

interface ScannedNote { path: string; content: string; date?: string }

async function scanDirs(root: string, dirs: string[]): Promise<Map<string, ScannedNote>> {
  const map = new Map<string, ScannedNote>();
  for (const dir of dirs) {
    const dirPath = join(root, dir);
    try {
      for (const entry of await readdir(dirPath)) {
        if (!entry.endsWith('.md')) continue;
        try {
          const path = join(dirPath, entry);
          const content = await readFile(path, 'utf8');
          const fm = parseFrontmatter(content);
          const date = fm['synced-at'] ?? fm['promoted-date'] ?? fm.date ?? undefined;
          map.set(entry.toLowerCase(), { path, content, date });
        } catch { /* skip unreadable */ }
      }
    } catch { /* dir missing */ }
  }
  return map;
}

function stripDatePrefix(f: string): string { return f.replace(/^\d{4}-\d{2}-\d{2}-/, ''); }

// --- Claude drift analysis ---

interface PairInput { filename: string; projectContent: string; brainContent: string }

async function analyzeDrift(pairs: PairInput[]): Promise<z.infer<typeof AlignmentBatchSchema>['results']> {

  const notesText = pairs.map(p =>
    `=== Pair: ${p.filename} ===\n[PROJECT]\n${p.projectContent.slice(0, MAX_NOTE_CHARS)}\n[BRAIN]\n${p.brainContent.slice(0, MAX_NOTE_CHARS)}\n=== End Pair ===`
  ).join('\n\n');

  const attempt = async (msg: string) => {
    try {
      const client = new Anthropic();
      const resp = await client.messages.create({
        model: DEFAULT_MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: msg }],
      });
      const text = (resp.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined)?.text.trim() ?? '';
      // Try direct JSON, then markdown block
      for (const src of [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? '']) {
        try { return JSON.parse(src); } catch { /* try next */ }
      }
      return null;
    } catch (err) { console.error('[alignment-checker] API error:', err); return null; }
  };

  const msg = `Analyze these note pairs for drift:\n\n${notesText}`;
  let parsed = await attempt(msg);
  if (!parsed) parsed = await attempt(msg + '\n\nRespond with valid JSON only.');

  const validated = AlignmentBatchSchema.safeParse(parsed);
  if (!validated.success) { console.warn('[alignment-checker] Zod validation failed'); return []; }
  return validated.data.results;
}

// --- Auto-update logic ---

async function applyUpdate(
  detail: AlignmentDetail,
  projectNote: ScannedNote,
  brainNote: ScannedNote,
  now: string,
): Promise<boolean> {
  try {
    const isProjectNewer = detail.direction === 'project-to-brain';
    const srcPath = isProjectNewer ? projectNote.path : brainNote.path;
    const dstPath = isProjectNewer ? brainNote.path : projectNote.path;
    const srcContent = isProjectNewer ? projectNote.content : brainNote.content;

    await copyFile(dstPath, dstPath + '.bak');
    const updated = mergeFrontmatter(srcContent, { 'synced-at': now });
    await writeFile(dstPath, updated, 'utf8');
    console.log(`[alignment-checker] updated: ${detail.filename} (${detail.direction})`);
    return true;
  } catch (err) {
    console.error(`[alignment-checker] update error: ${detail.filename}`, err);
    return false;
  }
}

// --- Main export ---

/**
 * Scan both vaults, match by filename, detect drift via Claude.
 * Optional auto-update copies newer version (backs up old as .bak). Never throws.
 */
export async function checkAlignment(opts: AlignmentCheckOptions): Promise<AlignmentResult> {
  const { vaultPath, brainPath, projectName, dryRun = false, autoUpdate = false } = opts;
  const details: AlignmentDetail[] = [];

  // 1. Scan both vaults
  const [projectNotes, brainNotes] = await Promise.all([
    scanDirs(vaultPath, VAULT_SCAN_DIRS),
    scanDirs(brainPath, BRAIN_SCAN_DIRS),
  ]);

  // 2. Build slug → brain filename map for matching
  const brainBySlug = new Map<string, string>(); // slug → lowercased filename
  for (const name of brainNotes.keys()) brainBySlug.set(stripDatePrefix(name), name);

  // 3. Match pairs
  const driftPairs: PairInput[] = [];
  const matchedPairs: Array<{ filename: string; proj: ScannedNote; brain: ScannedNote }> = [];

  for (const [projName, projNote] of projectNotes) {
    const slug = stripDatePrefix(projName);
    const brainName = brainNotes.has(projName) ? projName : brainBySlug.get(slug);
    if (!brainName) continue;
    const brainNote = brainNotes.get(brainName)!;

    if (projNote.content === brainNote.content) {
      // Identical — no Claude call needed
      details.push({
        filename: projName, status: 'aligned', direction: 'none',
        reason: 'content identical', projectPath: projNote.path, brainPath: brainNote.path,
        projectDate: projNote.date, brainDate: brainNote.date,
      });
    } else {
      driftPairs.push({ filename: projName, projectContent: projNote.content, brainContent: brainNote.content });
      matchedPairs.push({ filename: projName, proj: projNote, brain: brainNote });
    }
  }

  // 4. Batch drift analysis (max MAX_BATCH_SIZE per call)
  const now = new Date().toISOString();
  for (let i = 0; i < driftPairs.length; i += MAX_BATCH_SIZE) {
    const batch = driftPairs.slice(i, i + MAX_BATCH_SIZE);
    const results = await analyzeDrift(batch);
    const resultMap = new Map(results.map(r => [r.filename, r]));

    for (const { filename, proj, brain } of matchedPairs.slice(i, i + MAX_BATCH_SIZE)) {
      const r = resultMap.get(filename);
      const detail: AlignmentDetail = {
        filename, status: r?.status ?? 'contradicting',
        direction: r?.direction ?? 'manual-review',
        reason: r?.reason ?? 'analysis failed',
        projectPath: proj.path, brainPath: brain.path,
        projectDate: proj.date, brainDate: brain.date,
      };

      // 5. Auto-update if enabled and applicable
      if (autoUpdate && !dryRun && (detail.status === 'outdated' || detail.status === 'superseded') &&
          detail.direction !== 'manual-review') {
        detail.updated = await applyUpdate(detail, proj, brain, now);
      }

      console.log(`[alignment-checker] ${projectName}: ${filename} → ${detail.status} (${detail.direction})`);
      details.push(detail);
    }
  }

  const aligned = details.filter(d => d.status === 'aligned').length;
  return { total: details.length, aligned, drifted: details.length - aligned, details };
}
