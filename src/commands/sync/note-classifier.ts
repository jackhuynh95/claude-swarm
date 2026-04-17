import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { hasAnthropicEnvAuth, warnAuthUnavailableOnce } from './anthropic-auth-guard.js';

// --- Zod schemas for response validation ---

const NoteClassificationSchema = z.object({
  filename: z.string(),
  action: z.enum(['promote', 'skip']),
  reason: z.string(),
  category: z.enum(['lesson', 'pattern', 'decision', 'foundation', 'project-specific']),
});

const BatchClassificationSchema = z.object({
  classifications: z.array(NoteClassificationSchema),
});

// --- Public types ---

export interface NoteInput {
  filename: string;  // e.g. "chart-js-config-pattern.md"
  content: string;   // full markdown content
}

export interface NoteClassification {
  filename: string;
  action: 'promote' | 'skip';
  reason: string;    // why this classification
  category: 'lesson' | 'pattern' | 'decision' | 'foundation' | 'project-specific';
}

export interface ClassificationResult {
  classifications: NoteClassification[];
  model: string;        // model used
  inputTokens: number;  // usage tracking
  outputTokens: number;
}

export interface ClassifierOptions {
  model?: string;       // default: claude-haiku-4-5-20251001
  projectName?: string; // context hint in prompt (e.g. "medusa")
}

// --- Constants ---

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_NOTE_CHARS = 2000;
const MAX_TOKENS = 1024;
const MAX_BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You are a note classifier for a software project's knowledge vault.
Classify each note as:
- "promote" if reusable across projects: patterns, standards, conventions,
  foundation knowledge (framework setup, library configs, code standards)
- "skip" if project-specific: bug fix for one issue, PR-specific context,
  temporary state, issue-specific debugging

Categories:
- lesson: hard-won insight, gotcha, non-obvious behavior
- pattern: reusable code pattern, architectural blueprint
- decision: architectural decision, standard, convention
- foundation: framework setup, library config, environment setup
- project-specific: only relevant to this specific project

Output valid JSON matching the schema. For batch input, return
{ "classifications": [...] } with one entry per note in the same order.`;

// --- Implementation ---

/**
 * Classify multiple notes in one API call (saves tokens).
 * Handles 1–20 notes per call. Never throws — returns empty array on failure.
 */
export async function classifyNotes(
  notes: NoteInput[],
  opts: ClassifierOptions = {},
): Promise<ClassificationResult> {
  if (notes.length === 0) {
    return { classifications: [], model: opts.model ?? DEFAULT_MODEL, inputTokens: 0, outputTokens: 0 };
  }

  // Short-circuit if env auth is unavailable — prevents repeated SDK stack traces
  // and makes the data-loss explicit in a single log line per process.
  if (!hasAnthropicEnvAuth()) {
    warnAuthUnavailableOnce('note-classifier', 'vault note classification');
    return { classifications: [], model: opts.model ?? DEFAULT_MODEL, inputTokens: 0, outputTokens: 0 };
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const batch = notes.slice(0, MAX_BATCH_SIZE);

  // Build user message with note blocks
  const notesText = batch
    .map((n) => {
      const truncated = n.content.slice(0, MAX_NOTE_CHARS);
      return `=== Note: ${n.filename} ===\n${truncated}\n=== End Note ===`;
    })
    .join('\n\n');

  const projectHint = opts.projectName
    ? `\nProject context: ${opts.projectName}`
    : '';

  const userMessage = `${projectHint ? projectHint + '\n\n' : ''}Classify the following notes:\n\n${notesText}`;

  // First attempt
  let result = await attemptClassification(model, userMessage);

  // Retry once if JSON parse failed
  if (!result.parsed) {
    const retryMessage = userMessage + '\n\nRespond with valid JSON only, no markdown code blocks.';
    result = await attemptClassification(model, retryMessage);
  }

  if (!result.parsed) {
    console.error('[note-classifier] Failed to parse Claude response after retry');
    return { classifications: [], model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // Validate with zod
  const validated = BatchClassificationSchema.safeParse(result.parsed);
  if (!validated.success) {
    console.warn('[note-classifier] Zod validation failed, using raw data with defaults:', validated.error.message);
    // Return raw parsed data cast to schema shape as fallback
    const raw = (result.parsed as { classifications?: unknown[] }).classifications ?? [];
    const fallback: NoteClassification[] = raw.map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        filename: String(obj['filename'] ?? ''),
        action: (obj['action'] === 'skip' ? 'skip' : 'promote') as 'promote' | 'skip',
        reason: String(obj['reason'] ?? ''),
        category: (['lesson', 'pattern', 'decision', 'foundation', 'project-specific'].includes(String(obj['category']))
          ? obj['category']
          : 'project-specific') as NoteClassification['category'],
      };
    });
    return { classifications: fallback, model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  return {
    classifications: validated.data.classifications,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

/**
 * Classify a single note. Convenience wrapper around classifyNotes.
 * Returns null on failure.
 */
export async function classifyNote(
  note: NoteInput,
  opts: ClassifierOptions = {},
): Promise<NoteClassification | null> {
  const result = await classifyNotes([note], opts);
  return result.classifications[0] ?? null;
}

// --- Internal helpers ---

interface AttemptResult {
  parsed: unknown;
  inputTokens: number;
  outputTokens: number;
}

async function attemptClassification(model: string, userMessage: string): Promise<AttemptResult> {
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

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { parsed: null, inputTokens, outputTokens };
    }

    const text = textBlock.text.trim();
    const parsed = extractJson(text);
    return { parsed, inputTokens, outputTokens };
  } catch (err) {
    console.error('[note-classifier] API error:', err);
    return { parsed: null, inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Extract JSON from response text. Handles raw JSON and markdown code blocks.
 */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block: ```json ... ```
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // fall through
      }
    }
    return null;
  }
}
