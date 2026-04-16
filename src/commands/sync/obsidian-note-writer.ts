/**
 * Obsidian note writer — shared persistence layer for all vault artifacts.
 *
 * Uses obsidian-note-spec for folder routing, filename conventions,
 * frontmatter, and backlinks. All vault writes should go through this module.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  resolveFolder,
  resolveFilename,
  buildNoteFrontmatter,
  buildBacklinksSection,
  type NotePayload,
} from './obsidian-note-spec.js';

export interface WriteResult {
  written: boolean;
  path?: string;
  reason?: string;
}

/**
 * Write a new note to the vault. Creates parent directories as needed.
 * Best-effort — returns { written: false } on error rather than throwing.
 */
export async function writeNote(vaultPath: string, payload: NotePayload): Promise<WriteResult> {
  try {
    const folder = resolveFolder(payload.noteType);
    const filename = resolveFilename(payload);
    const dir = join(vaultPath, folder);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);

    const frontmatter = buildNoteFrontmatter(payload);
    const backlinks = buildBacklinksSection(payload);
    const content = `${frontmatter}${payload.body}\n${backlinks}`;

    await writeFile(filePath, content, 'utf8');
    return { written: true, path: filePath };
  } catch (err) {
    return { written: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Append a section to an existing note, or create a new note if it doesn't exist.
 * Used by run-recorder for retry sections appended to the same daily run file.
 */
export async function appendSection(
  vaultPath: string,
  payload: NotePayload,
  appendContent: string,
): Promise<WriteResult> {
  try {
    const folder = resolveFolder(payload.noteType);
    const filename = resolveFilename(payload);
    const dir = join(vaultPath, folder);
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);

    let existing: string | null = null;
    try { existing = await readFile(filePath, 'utf8'); } catch { /* file doesn't exist */ }

    if (existing) {
      await writeFile(filePath, existing + appendContent, 'utf8');
    } else {
      // First write — include frontmatter + body + backlinks
      const frontmatter = buildNoteFrontmatter(payload);
      const backlinks = buildBacklinksSection(payload);
      await writeFile(filePath, `${frontmatter}${payload.body}\n${backlinks}`, 'utf8');
    }

    return { written: true, path: filePath };
  } catch (err) {
    return { written: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
