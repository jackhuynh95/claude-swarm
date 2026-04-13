import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_CONTEXT_CHARS = 3000;

// Generic task context — replaces direct GHIssue dependency.
// GHIssue { title, body } satisfies this shape (body → description at call site).
export interface TaskContext {
  title: string;
  description?: string;
}

type NoteSource = 'knowledge-pattern' | 'knowledge-decision' | 'knowledge-lesson' | 'raw-note';

interface VaultNote {
  name: string;
  content: string;
  modifiedAt: Date;
  relevanceScore: number;
  source: NoteSource;
  tags: string[];
}

// Knowledge/ subdir → NoteSource mapping (read order = priority: patterns first)
const KNOWLEDGE_SUBDIRS: Array<{ dir: string; source: NoteSource }> = [
  { dir: 'Knowledge/Patterns',  source: 'knowledge-pattern'  },
  { dir: 'Knowledge/Decisions', source: 'knowledge-decision' },
  { dir: 'Knowledge/Lessons',   source: 'knowledge-lesson'   },
];

const CATEGORY_WEIGHT: Record<NoteSource, number> = {
  'knowledge-pattern':  3,
  'knowledge-decision': 2,
  'knowledge-lesson':   1,
  'raw-note':           0,
};

// Graduated recency tiers (days → score)
const RECENCY_TIERS = [
  { days: 7,  score: 3 },
  { days: 14, score: 2 },
  { days: 30, score: 1 },
];

const TAG_MATCH_BONUS = 2;

// ─── Frontmatter parser ───────────────────────────────────────────────────────

/** Extract `tags` and `category` from YAML frontmatter. Never throws. */
function parseFrontmatter(content: string): { tags: string[]; category: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { tags: [], category: '' };
  let tags: string[] = [];
  let category = '';
  for (const line of match[1].split('\n')) {
    if (line.startsWith('tags:')) {
      // Support: tags: [a, b] or tags: a, b
      const raw = line.slice(5).trim().replace(/^\[|\]$/g, '');
      tags = raw.split(',').map(t => t.trim()).filter(Boolean);
    } else if (line.startsWith('category:')) {
      category = line.slice(9).trim();
    }
  }
  return { tags, category };
}

// ─── Note readers ─────────────────────────────────────────────────────────────

/** Read Knowledge/Lessons, Patterns, Decisions — parse frontmatter tags. */
async function readKnowledgeNotes(vaultPath: string): Promise<VaultNote[]> {
  const notes: VaultNote[] = [];
  for (const { dir, source } of KNOWLEDGE_SUBDIRS) {
    const fullDir = join(vaultPath, dir);
    let entries: string[];
    try {
      entries = await readdir(fullDir);
    } catch {
      continue; // dir missing — skip gracefully
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = join(fullDir, entry);
      try {
        const [content, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
        const { tags } = parseFrontmatter(content);
        notes.push({ name: entry.replace(/\.md$/, ''), content, modifiedAt: fileStat.mtime, relevanceScore: 0, source, tags });
      } catch { /* skip unreadable */ }
    }
  }
  return notes;
}

/** Read Notes/ directory as raw supplemental notes. */
async function readRawNotes(vaultPath: string): Promise<VaultNote[]> {
  const notesDir = join(vaultPath, 'Notes');
  let entries: string[];
  try {
    entries = await readdir(notesDir);
  } catch {
    return [];
  }
  const notes: VaultNote[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(notesDir, entry);
    try {
      const [content, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
      notes.push({ name: entry.replace(/\.md$/, ''), content, modifiedAt: fileStat.mtime, relevanceScore: 0, source: 'raw-note', tags: [] });
    } catch { /* skip */ }
  }
  return notes;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function extractKeywords(context: TaskContext): string[] {
  const text = `${context.title} ${context.description ?? ''}`.toLowerCase();
  const stopwords = new Set(['with', 'from', 'that', 'this', 'have', 'will', 'when', 'then', 'into', 'been', 'also']);
  return text.split(/\W+/).filter(w => w.length >= 4 && !stopwords.has(w));
}

function recencyScore(modifiedAt: Date): number {
  const ageDays = (Date.now() - modifiedAt.getTime()) / (1000 * 60 * 60 * 24);
  for (const tier of RECENCY_TIERS) {
    if (ageDays <= tier.days) return tier.score;
  }
  return 0;
}

function filterAndScore(notes: VaultNote[], keywords: string[]): VaultNote[] {
  const scored = notes.map(note => {
    const haystack = `${note.name} ${note.content}`.toLowerCase();
    const keywordMatches = keywords.filter(kw => haystack.includes(kw)).length;
    const tagBonus = note.tags.some(tag => keywords.includes(tag.toLowerCase())) ? TAG_MATCH_BONUS : 0;
    const score = keywordMatches * 2 + CATEGORY_WEIGHT[note.source] + recencyScore(note.modifiedAt) + tagBonus;
    return { ...note, relevanceScore: score };
  });
  return scored.filter(n => n.relevanceScore > 0).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContextSummary(notes: VaultNote[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const note of notes) {
    const header = `### ${note.name}\n`;
    const body = note.content.replace(/^---[\s\S]*?---\n/, '').trim();
    const entry = `${header}${body}\n\n`;
    if (used + entry.length > maxChars) {
      const remaining = maxChars - used - header.length - 4;
      if (remaining > 100) lines.push(`${header}${body.slice(0, remaining)}...\n\n`);
      break;
    }
    lines.push(entry);
    used += entry.length;
  }
  return lines.join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load relevant vault notes from Knowledge/ (priority) then Notes/ for planning context.
 * Accepts generic TaskContext — backward-compatible: pass { title: issue.title, description: issue.body }.
 * Returns formatted context string, or empty string. Never throws.
 */
export async function loadVaultContext(vaultPath: string, context: TaskContext): Promise<string> {
  try {
    const [knowledgeNotes, rawNotes] = await Promise.all([
      readKnowledgeNotes(vaultPath),
      readRawNotes(vaultPath),
    ]);
    const allNotes = [...knowledgeNotes, ...rawNotes];
    if (allNotes.length === 0) return '';

    const keywords = extractKeywords(context);
    const filtered = filterAndScore(allNotes, keywords);
    if (filtered.length === 0) return '';

    const summary = buildContextSummary(filtered, MAX_CONTEXT_CHARS);
    return `## Vault Context\n${summary}`;
  } catch {
    return '';
  }
}
