/**
 * Obsidian note spec — shared types, folder routing, filename conventions,
 * frontmatter building, and backlink generation for all vault artifacts.
 *
 * Used by: knowledge-writer, cook-lesson-extractor, run-recorder,
 *          journal-writer (prompt alignment), knowledge-extractor.
 */

import { buildFrontmatter, type ProvenanceFrontmatter } from './frontmatter-parser.js';

// ─── Note types ──────────────────────────────────────────────────────────────

export type NoteType =
  | 'daily'
  | 'run-review'
  | 'task-run'
  | 'knowledge-lesson'
  | 'knowledge-pattern'
  | 'knowledge-decision'
  | 'debrief'
  | 'raw-note';

/** Structured payload that all vault-writing paths produce before persistence. */
export interface NotePayload {
  noteType: NoteType;
  title: string;
  body: string;
  date: string;              // YYYY-MM-DD
  project: string;
  sourcePhase: string;
  issue?: number;
  taskId?: string;
  verdict?: string;
  tags?: string[];
  classifiedBy?: string;
  classificationReason?: string;
  backlinks?: string[];      // wiki-link targets, e.g. ['2026-04-16', 'issue-42']
}

// ─── Folder routing ──────────────────────────────────────────────────────────

const FOLDER_MAP: Record<NoteType, string> = {
  'daily':              'Daily',
  'run-review':         'Runs',
  'task-run':           'Runs',
  'knowledge-lesson':   'Knowledge/Lessons',
  'knowledge-pattern':  'Knowledge/Patterns',
  'knowledge-decision': 'Knowledge/Decisions',
  'debrief':            'Review',
  'raw-note':           'Notes',
};

export function resolveFolder(noteType: NoteType): string {
  return FOLDER_MAP[noteType];
}

// ─── Filename conventions ────────────────────────────────────────────────────

export function toKebabSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

export function resolveFilename(payload: NotePayload): string {
  const slug = toKebabSlug(payload.title);
  switch (payload.noteType) {
    case 'daily':              return `${payload.date}.md`;
    case 'run-review':         return `${payload.date}-issue-${payload.issue ?? 'unknown'}.md`;
    case 'task-run':           return `${payload.date}-task-${payload.taskId ?? 'unknown'}.md`;
    case 'debrief':            return `${payload.date}-debrief-issue-${payload.issue ?? 'unknown'}.md`;
    case 'raw-note':           return `${slug}.md`;
    case 'knowledge-lesson':
    case 'knowledge-pattern':
    case 'knowledge-decision': return `${payload.date}-${slug}.md`;
  }
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

/** Map NotePayload → ProvenanceFrontmatter → YAML string. */
export function buildNoteFrontmatter(payload: NotePayload): string {
  const meta: ProvenanceFrontmatter = {
    date: payload.date,
    'source-phase': payload.sourcePhase,
    'source-project': payload.project,
    project: payload.project,
    'synced-at': new Date().toISOString(),
    tags: payload.tags ?? deriveDefaultTags(payload),
  };

  if (payload.issue != null)              meta.issue = payload.issue;
  if (payload.taskId)                     meta['task-id'] = payload.taskId;
  if (payload.verdict)                    meta.verdict = payload.verdict;
  if (payload.classifiedBy)               meta['classified-by'] = payload.classifiedBy;
  if (payload.classificationReason)       meta['classification-reason'] = payload.classificationReason;

  // Knowledge notes get category field
  if (payload.noteType.startsWith('knowledge-')) {
    meta.category = payload.noteType.replace('knowledge-', '');
  }

  return buildFrontmatter(meta);
}

function deriveDefaultTags(payload: NotePayload): string[] {
  const base = [payload.sourcePhase];
  switch (payload.noteType) {
    case 'run-review':         return ['run', ...base];
    case 'task-run':           return ['task-run', ...base];
    case 'debrief':            return ['debrief', ...base];
    case 'knowledge-lesson':   return ['knowledge', 'lesson'];
    case 'knowledge-pattern':  return ['knowledge', 'pattern'];
    case 'knowledge-decision': return ['knowledge', 'decision'];
    default:                   return base;
  }
}

// ─── Backlinks ───────────────────────────────────────────────────────────────

/** Build a References section with wiki-links to related notes. */
export function buildBacklinksSection(payload: NotePayload): string {
  const links: string[] = [];

  // Always link to daily note
  links.push(`[[${payload.date}]]`);

  // Link to run review if issue-scoped
  if (payload.issue != null && payload.noteType !== 'run-review') {
    links.push(`[[${payload.date}-issue-${payload.issue}]]`);
  }

  // Explicit backlinks from payload
  if (payload.backlinks?.length) {
    for (const bl of payload.backlinks) {
      if (!links.includes(`[[${bl}]]`)) links.push(`[[${bl}]]`);
    }
  }

  if (links.length === 0) return '';
  return `\n---\nBacklinks: ${links.join(' · ')}\n`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map note-classifier category string to NoteType. */
export function mapCategoryToNoteType(category: string): NoteType {
  switch (category) {
    case 'lesson':     return 'knowledge-lesson';
    case 'pattern':    return 'knowledge-pattern';
    case 'decision':   return 'knowledge-decision';
    case 'foundation': return 'knowledge-lesson'; // treat foundation as lesson
    default:           return 'knowledge-lesson';
  }
}
