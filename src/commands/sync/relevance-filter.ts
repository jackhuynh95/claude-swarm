// Relevance filter for smart-push: scores second-brain notes against a project task context.
// Uses Claude sonnet (context understanding) rather than haiku (simple classify).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { NoteInput } from './note-classifier.js';
import { hasAnthropicEnvAuth, warnAuthUnavailableOnce } from './anthropic-auth-guard.js';

// --- Zod schemas ---

const RelevanceResultSchema = z.object({
  filename: z.string(),
  relevant: z.boolean(),
  reason: z.string(),
  score: z.number().min(0).max(10),
});

const RelevanceBatchSchema = z.object({
  results: z.array(RelevanceResultSchema),
});

// --- Public types ---

export interface RelevanceResult {
  filename: string;
  relevant: boolean; // true = inject, false = skip
  reason: string;    // why relevant or not
  score: number;     // 0-10 confidence
}

export interface RelevanceBatchResult {
  results: RelevanceResult[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface RelevanceFilterOptions {
  model?: string; // default: claude-sonnet-4-5-20250514
}

// --- Constants ---

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250514';
const MAX_NOTE_CHARS = 2000;
export const MAX_BATCH_SIZE = 15; // sonnet is more expensive — keep batches smaller
const MAX_TOKENS = 2048;
const RELEVANCE_THRESHOLD = 5; // score >= 5 means relevant

const SYSTEM_PROMPT = `You are a knowledge relevance filter for a software project.
Given a task context and a list of knowledge notes, classify each note:
- "relevant" (relevant: true) if the note contains patterns, lessons, or decisions
  that would help with the given task context
- "not relevant" (relevant: false) if the note is about unrelated technologies,
  different problem domains, or wouldn't help with this task

Score relevance 0-10 (0 = completely unrelated, 10 = directly applicable).
A note is relevant if score >= ${RELEVANCE_THRESHOLD}.

Output valid JSON only: { "results": [{ "filename": string, "relevant": boolean, "reason": string, "score": number }] }`;

// --- Implementation ---

/**
 * Filter a batch of notes by relevance to a task context via Claude sonnet.
 * Never throws — returns empty results on failure.
 */
export async function filterByRelevance(
  context: string,
  notes: NoteInput[],
  opts: RelevanceFilterOptions = {},
): Promise<RelevanceBatchResult> {
  const model = opts.model ?? DEFAULT_MODEL;

  if (notes.length === 0) {
    return { results: [], model, inputTokens: 0, outputTokens: 0 };
  }

  // Short-circuit if env auth is unavailable — preserves non-blocking behavior
  // and emits a single informational log instead of a retry-doubled stack trace.
  if (!hasAnthropicEnvAuth()) {
    warnAuthUnavailableOnce('relevance-filter', 'vault note relevance filtering');
    return { results: [], model, inputTokens: 0, outputTokens: 0 };
  }

  const batch = notes.slice(0, MAX_BATCH_SIZE);
  const notesText = batch
    .map((n) => {
      const truncated = n.content.slice(0, MAX_NOTE_CHARS);
      return `=== Note: ${n.filename} ===\n${truncated}\n=== End Note ===`;
    })
    .join('\n\n');

  const userMessage = `Task context: ${context}\n\nScore relevance of the following notes:\n\n${notesText}`;

  let result = await attemptRelevance(model, userMessage);

  // Retry once on parse failure
  if (!result.parsed) {
    const retryMessage = userMessage + '\n\nRespond with valid JSON only, no markdown code blocks.';
    result = await attemptRelevance(model, retryMessage);
  }

  if (!result.parsed) {
    console.error('[relevance-filter] Failed to parse Claude response after retry');
    return { results: [], model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  const validated = RelevanceBatchSchema.safeParse(result.parsed);
  if (!validated.success) {
    console.warn('[relevance-filter] Zod validation failed, using raw fallback:', validated.error.message);
    const raw = (result.parsed as { results?: unknown[] }).results ?? [];
    const fallback: RelevanceResult[] = raw.map((item) => {
      const obj = item as Record<string, unknown>;
      const score = typeof obj['score'] === 'number' ? obj['score'] : 0;
      return {
        filename: String(obj['filename'] ?? ''),
        relevant: typeof obj['relevant'] === 'boolean' ? obj['relevant'] : score >= RELEVANCE_THRESHOLD,
        reason: String(obj['reason'] ?? ''),
        score,
      };
    });
    return { results: fallback, model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  return {
    results: validated.data.results,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// --- Internal helpers ---

interface AttemptResult {
  parsed: unknown;
  inputTokens: number;
  outputTokens: number;
}

async function attemptRelevance(model: string, userMessage: string): Promise<AttemptResult> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { parsed: null, inputTokens, outputTokens };
    }

    const text = textBlock.text.trim();
    const parsed = extractJson(text);
    return { parsed, inputTokens, outputTokens };
  } catch (err) {
    console.error('[relevance-filter] API error:', err);
    return { parsed: null, inputTokens: 0, outputTokens: 0 };
  }
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
    }
    return null;
  }
}
