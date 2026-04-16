/**
 * Knowledge writer — classify notes and persist to Knowledge/ via shared note-writer.
 * Used by: cook-lesson-extractor, knowledge-extractor, and any path that captures knowledge.
 */

import { classifyNote } from './note-classifier.js';
import type { NoteInput } from './note-classifier.js';
import { writeNote } from './obsidian-note-writer.js';
import { mapCategoryToNoteType, toKebabSlug } from './obsidian-note-spec.js';

// --- Types ---

export interface KnowledgeNote {
  title: string;
  content: string;
}

export interface KnowledgeMetadata {
  issue?: number;
  project: string;
  sourcePhase: 'journal' | 'run-record' | 'cook' | 'plan' | 'debrief';
  date: string; // YYYY-MM-DD
  taskId?: string; // optional task identifier (e.g. "1.2")
}

export interface CaptureResult {
  captured: boolean;
  path?: string;
  category?: string;
  reason?: string;
}

// --- Public API ---

/**
 * Classify a note and write it to Knowledge/{category}/ via shared note-writer.
 * Best-effort — never throws.
 */
export async function captureKnowledge(
  vaultPath: string,
  note: KnowledgeNote,
  metadata: KnowledgeMetadata,
): Promise<CaptureResult> {
  try {
    const noteInput: NoteInput = {
      filename: toKebabSlug(note.title) + '.md',
      content: note.content,
    };

    const classification = await classifyNote(noteInput, { projectName: metadata.project });

    // Skip project-specific notes or classification failures
    if (!classification || classification.action === 'skip' || classification.category === 'project-specific') {
      const reason = classification?.reason ?? 'classification failed';
      console.log(`[knowledge-writer] skip: ${noteInput.filename} — ${reason}`);
      return { captured: false, reason };
    }

    const noteType = mapCategoryToNoteType(classification.category);
    const result = await writeNote(vaultPath, {
      noteType,
      title: note.title,
      body: note.content,
      date: metadata.date,
      project: metadata.project,
      sourcePhase: metadata.sourcePhase,
      issue: metadata.issue,
      taskId: metadata.taskId,
      tags: ['knowledge', classification.category],
      classifiedBy: 'haiku',
      classificationReason: classification.reason,
    });

    if (result.written) {
      console.log(`[knowledge-writer] captured: ${result.path}`);
    }
    return { captured: result.written, path: result.path, category: classification.category, reason: result.reason };
  } catch (err) {
    console.error('[knowledge-writer] error:', err);
    return { captured: false, reason: String(err) };
  }
}
