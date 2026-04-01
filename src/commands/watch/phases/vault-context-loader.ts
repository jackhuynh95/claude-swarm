import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GHIssue } from '../types.js';

const NOTES_DIR = 'Notes';
const MAX_CONTEXT_CHARS = 2000;
const RECENCY_DAYS = 30;

interface VaultNote {
  name: string;
  content: string;
  modifiedAt: Date;
  relevanceScore: number;
}

/**
 * Load relevant vault notes from obsidian-vault/Notes/ for planning context.
 * Returns a formatted context string, or empty string on any error.
 * Never throws — graceful fallback if vault is missing or empty.
 */
export async function loadVaultContext(vaultPath: string, issue: GHIssue): Promise<string> {
  try {
    const notesDir = join(vaultPath, NOTES_DIR);
    const notes = await readNotes(notesDir);
    if (notes.length === 0) return '';

    const keywords = extractKeywords(issue);
    const filtered = filterAndScore(notes, keywords);
    if (filtered.length === 0) return '';

    const summary = buildContextSummary(filtered, MAX_CONTEXT_CHARS);
    return `## Vault Context\n${summary}`;
  } catch {
    return '';
  }
}

async function readNotes(notesDir: string): Promise<VaultNote[]> {
  let entries: string[];
  try {
    entries = await readdir(notesDir);
  } catch {
    return [];
  }

  const cutoff = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);
  const notes: VaultNote[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(notesDir, entry);
    try {
      const [content, fileStat] = await Promise.all([
        readFile(filePath, 'utf8'),
        stat(filePath),
      ]);
      const modifiedAt = fileStat.mtime;
      if (modifiedAt >= cutoff) {
        notes.push({ name: entry.replace(/\.md$/, ''), content, modifiedAt, relevanceScore: 0 });
      }
    } catch {
      // skip unreadable files
    }
  }

  return notes;
}

function extractKeywords(issue: GHIssue): string[] {
  const text = `${issue.title} ${issue.body ?? ''}`.toLowerCase();
  // Extract meaningful words (≥4 chars, skip common stopwords)
  const stopwords = new Set(['with', 'from', 'that', 'this', 'have', 'will', 'when', 'then', 'into', 'been', 'also']);
  return text
    .split(/\W+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));
}

function filterAndScore(notes: VaultNote[], keywords: string[]): VaultNote[] {
  const cutoff = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);
  const scored = notes.map((note) => {
    const haystack = `${note.name} ${note.content}`.toLowerCase();
    const keywordMatches = keywords.filter((kw) => haystack.includes(kw)).length;
    const isRecent = note.modifiedAt >= cutoff ? 1 : 0;
    return { ...note, relevanceScore: keywordMatches * 2 + isRecent };
  });

  // Keep notes with at least some relevance, sorted best-first
  return scored
    .filter((n) => n.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function buildContextSummary(notes: VaultNote[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0;

  for (const note of notes) {
    const header = `### ${note.name}\n`;
    // Trim note content to first meaningful lines
    const body = note.content.replace(/^---[\s\S]*?---\n/, '').trim();
    const entry = `${header}${body}\n\n`;

    if (used + entry.length > maxChars) {
      // Fit as much as possible from this note
      const remaining = maxChars - used - header.length - 4;
      if (remaining > 100) {
        lines.push(`${header}${body.slice(0, remaining)}...\n\n`);
      }
      break;
    }

    lines.push(entry);
    used += entry.length;
  }

  return lines.join('');
}
