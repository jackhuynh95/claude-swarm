import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyNote } from './note-classifier.js';
import type { NoteInput } from './note-classifier.js';

// --- Types ---

export interface KnowledgeNote {
  title: string;
  content: string;
}

export interface KnowledgeMetadata {
  issue?: number;
  project: string;
  sourcePhase: 'journal' | 'run-record' | 'cook' | 'plan';
  date: string; // YYYY-MM-DD
}

export interface CaptureResult {
  captured: boolean;
  path?: string;
  category?: string;
  reason?: string;
}

// --- Constants ---

/** Map classification category → Knowledge subdirectory */
const CATEGORY_DIR: Record<string, string> = {
  lesson:    'Lessons',
  pattern:   'Patterns',
  decision:  'Decisions',
  foundation: 'Lessons', // treat as lesson
};

// --- Helpers ---

function toKebabCase(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function buildFrontmatter(
  meta: KnowledgeMetadata,
  category: string,
  reason: string,
): string {
  const lines: string[] = [
    '---',
    `date: ${meta.date}`,
    `category: ${category}`,
    `source-phase: ${meta.sourcePhase}`,
  ];
  if (meta.issue != null) lines.push(`issue: ${meta.issue}`);
  lines.push(
    `project: ${meta.project}`,
    `tags: [knowledge, ${category}]`,
    `classified-by: haiku`,
    `classification-reason: "${reason.replace(/"/g, "'")}"`,
    '---',
    '',
  );
  return lines.join('\n');
}

// --- Public API ---

/**
 * Classify a note and write it to Knowledge/{category}/ with provenance frontmatter.
 * Best-effort — never throws.
 */
export async function captureKnowledge(
  vaultPath: string,
  note: KnowledgeNote,
  metadata: KnowledgeMetadata,
): Promise<CaptureResult> {
  try {
    const noteInput: NoteInput = {
      filename: toKebabCase(note.title) + '.md',
      content: note.content,
    };

    const classification = await classifyNote(noteInput, { projectName: metadata.project });

    // Skip project-specific notes or classification failures
    if (!classification || classification.action === 'skip' || classification.category === 'project-specific') {
      const reason = classification?.reason ?? 'classification failed';
      console.log(`[knowledge-writer] skip: ${noteInput.filename} — ${reason}`);
      return { captured: false, reason };
    }

    const dir = CATEGORY_DIR[classification.category] ?? 'Lessons';
    const targetDir = join(vaultPath, 'Knowledge', dir);
    await mkdir(targetDir, { recursive: true });

    const slug = toKebabCase(note.title);
    const filename = `${metadata.date}-${slug}.md`;
    const filePath = join(targetDir, filename);

    const frontmatter = buildFrontmatter(metadata, classification.category, classification.reason);
    await writeFile(filePath, frontmatter + note.content, 'utf8');

    console.log(`[knowledge-writer] captured: Knowledge/${dir}/${filename}`);
    return { captured: true, path: filePath, category: classification.category };
  } catch (err) {
    console.error('[knowledge-writer] error:', err);
    return { captured: false, reason: String(err) };
  }
}
