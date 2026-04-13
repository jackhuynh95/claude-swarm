import Anthropic from '@anthropic-ai/sdk';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureKnowledge } from './knowledge-writer.js';
import type { KnowledgeMetadata } from './knowledge-writer.js';
import { buildFrontmatter } from './frontmatter-parser.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_COOK_CHARS = 3000; // truncate long cook output
const EXTRACTION_TIMEOUT_MS = 30_000;
const RUNS_DIR = 'Review/Runs';

interface LessonObject {
  title: string;
  content: string;
  category?: string;
}

/** Extract lesson objects from cook stdout using haiku. Returns [] on any failure. */
async function extractLessonsWithHaiku(
  cookOutput: string,
  taskTitle: string,
): Promise<LessonObject[]> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return [];

  const truncated = cookOutput.slice(0, MAX_COOK_CHARS);
  const userMessage = `Task implemented: "${taskTitle}"

Cook output (truncated):
${truncated}

What was learned implementing this task? Identify reusable patterns, gotchas, or decisions.
Respond with a JSON array of lesson objects (max 3):
[{ "title": "...", "content": "...", "category": "lesson|pattern|decision" }]
Respond with valid JSON only, no markdown.`;

  try {
    const client = new Anthropic({ apiKey });

    // Race against 30s timeout
    const response = await Promise.race([
      client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 512,
        system: 'You are a knowledge extraction assistant. Extract reusable lessons from implementation summaries. Output valid JSON only.',
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), EXTRACTION_TIMEOUT_MS),
      ),
    ]);

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const text = textBlock.text.trim();

    // Try direct parse, then strip markdown code block
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { parsed = JSON.parse(match[1].trim()); } catch { return []; }
      } else {
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 3).filter(
      (item): item is LessonObject =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>)['title'] === 'string' &&
        typeof (item as Record<string, unknown>)['content'] === 'string',
    );
  } catch {
    return [];
  }
}

/** Write a brief task run summary to Review/Runs/{date}-task-{id}.md */
async function writeTaskRunSummary(
  vaultPath: string,
  taskId: string,
  taskTitle: string,
  epicTitle: string,
  date: string,
  project: string,
  issue?: number,
): Promise<void> {
  try {
    const runsDir = join(vaultPath, RUNS_DIR);
    await mkdir(runsDir, { recursive: true });
    const filePath = join(runsDir, `${date}-task-${taskId}.md`);
    const frontmatter = buildFrontmatter({
      date,
      'source-phase': 'cook',
      'source-project': project,
      project,
      issue,
      'task-id': taskId,
      'synced-at': new Date().toISOString(),
      tags: ['task-run', 'cook'],
    });
    const body = `# Task Run: ${taskTitle}\n\n**Epic**: ${epicTitle}\n**Date**: ${date}\n**Status**: completed via /ck:cook\n`;
    await writeFile(filePath, frontmatter + body, 'utf8');
  } catch {
    // best-effort
  }
}

/**
 * Extract lessons from cook output and write to Knowledge/.
 * Also writes a task run summary to Review/Runs/.
 * Best-effort — never throws, never blocks pipeline.
 */
export async function extractLessonsFromCook(
  cookOutput: string,
  taskId: string,
  taskTitle: string,
  epicTitle: string,
  roadmapPath: string,
  vaultPath: string,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  // Derive project name from roadmap path (last directory segment before filename)
  const parts = roadmapPath.replace(/\\/g, '/').split('/');
  const project = parts.length > 1 ? (parts[parts.length - 2] ?? 'unknown') : 'unknown';

  const metadata: KnowledgeMetadata = {
    project,
    sourcePhase: 'cook',
    date,
    taskId,
  };

  // Write task run summary — fire-and-forget
  writeTaskRunSummary(vaultPath, taskId, taskTitle, epicTitle, date, project).catch(() => {});

  // Extract and capture lessons via haiku
  try {
    const lessons = await extractLessonsWithHaiku(cookOutput, taskTitle);
    for (const lesson of lessons) {
      await captureKnowledge(vaultPath, { title: lesson.title, content: lesson.content }, metadata);
    }
    if (lessons.length > 0) {
      console.log(`[cook-lesson-extractor] captured ${lessons.length} lesson(s) from task ${taskId}`);
    }
  } catch {
    // best-effort
  }
}
