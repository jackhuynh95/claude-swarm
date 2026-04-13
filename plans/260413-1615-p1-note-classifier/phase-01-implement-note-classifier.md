---
phase: 1
priority: high
status: complete
effort: medium
---

# Phase 1 — Implement Note Classifier

## Context

- Roadmap: Smart Vault Sync, P1
- Parent plan: [plan.md](./plan.md)
- Existing vault loader: `src/commands/watch/phases/vault-context-loader.ts`
- Types: `src/commands/watch/types.ts`

## Overview

Create `src/commands/sync/note-classifier.ts` that uses Anthropic SDK (haiku) to classify project vault notes. Single-note and batch modes. Structured JSON output validated with zod.

## Key Decisions

1. **Anthropic SDK over Claude CLI** — classification is a simple API call, no tools needed. CLI spawns a full agent session which is overkill and expensive for classification.
2. **Zod for response validation** — already a dependency, validates Claude's JSON output.
3. **ANTHROPIC_API_KEY from env** — standard SDK pattern, no config file needed.
4. **Standalone module** — no integration with watcher/builder yet (that's P5/P6). This is a pure library module that future phases import.

## Architecture

```
src/commands/sync/
  note-classifier.ts    ← this phase
```

### Input/Output Contract

```typescript
// Input: a note to classify
interface NoteInput {
  filename: string;     // e.g. "chart-js-config-pattern.md"
  content: string;      // full markdown content
}

// Output: classification result per note
interface NoteClassification {
  filename: string;
  action: 'promote' | 'skip';
  reason: string;       // why this classification
  category: 'lesson' | 'pattern' | 'decision' | 'foundation' | 'project-specific';
}

// Batch result
interface ClassificationResult {
  classifications: NoteClassification[];
  model: string;        // model used
  inputTokens: number;  // usage tracking
  outputTokens: number;
}
```

### API Design

```typescript
// Classify a single note
classifyNote(note: NoteInput, opts?: ClassifierOptions): Promise<NoteClassification>

// Classify multiple notes in one API call (saves tokens)
classifyNotes(notes: NoteInput[], opts?: ClassifierOptions): Promise<ClassificationResult>

// Options
interface ClassifierOptions {
  model?: string;       // default: 'claude-haiku-4-5-20251001'
  projectName?: string; // for context in prompt (e.g. "medusa")
}
```

## Requirements

### Functional
- Classify notes as `promote` (reusable across projects) or `skip` (project-specific)
- Assign category: lesson, pattern, decision, foundation, project-specific
- Provide short reason for each classification
- Batch mode: classify up to 20 notes in one API call
- Single-note convenience wrapper that calls batch internally

### Non-Functional
- Use haiku model (cheapest, classification is simple)
- Validate Claude response with zod schema
- Graceful error handling — return error in result, never throw on API failures
- Track token usage in result for cost visibility

## Related Code Files

### Create
- `src/commands/sync/note-classifier.ts` — classifier module

### Modify
- `package.json` — add `@anthropic-ai/sdk` dependency

### Reference (read-only)
- `src/commands/watch/phases/vault-context-loader.ts` — existing vault note reading pattern
- `src/commands/watch/phases/model-router.ts` — existing model config pattern
- `src/commands/watch/types.ts` — existing type patterns

## Implementation Steps

1. Install `@anthropic-ai/sdk` dependency
   ```bash
   npm install @anthropic-ai/sdk
   ```

2. Create `src/commands/sync/note-classifier.ts` with:

   a. **Zod schemas** for validation:
   ```typescript
   import { z } from 'zod/v4';

   const NoteClassificationSchema = z.object({
     filename: z.string(),
     action: z.enum(['promote', 'skip']),
     reason: z.string(),
     category: z.enum(['lesson', 'pattern', 'decision', 'foundation', 'project-specific']),
   });

   const BatchClassificationSchema = z.object({
     classifications: z.array(NoteClassificationSchema),
   });
   ```

   b. **Classification prompt** (system message):
   ```
   You are a note classifier for a software project's knowledge vault.
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
   { "classifications": [...] } with one entry per note.
   ```

   c. **`classifyNotes` function** (batch, primary):
   - Create Anthropic client (reads ANTHROPIC_API_KEY from env)
   - Build user message with all notes formatted as:
     ```
     === Note: {filename} ===
     {content (first 2000 chars)}
     === End Note ===
     ```
   - Call `client.messages.create()` with:
     - model: `claude-haiku-4-5-20251001`
     - max_tokens: 1024 (classification output is small)
     - system: classification prompt
     - user: formatted notes
   - Extract text content from response
   - Parse JSON from response text
   - Validate with zod schema
   - Return `ClassificationResult` with usage stats

   d. **`classifyNote` function** (single, convenience):
   - Calls `classifyNotes([note], opts)`
   - Returns first classification

   e. **Error handling**:
   - API errors → return result with empty classifications and error logged
   - JSON parse errors → retry once with "respond with valid JSON only" appended
   - Zod validation errors → log warning, return raw parsed data with defaults

3. Run `npx tsc --noEmit` to verify compilation

## Success Criteria

- [x] `note-classifier.ts` compiles without errors
- [x] Exports `classifyNote`, `classifyNotes`, types
- [x] Uses Anthropic SDK with haiku model
- [x] Zod validates response schema
- [x] Batch mode handles 1-20 notes in one call
- [x] Token usage tracked in result
- [x] No integration with watcher/builder (pure library, that's P5/P6)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Claude returns malformed JSON | Medium | Zod validation + JSON extraction from markdown code blocks |
| API key missing | Low | Clear error message on missing ANTHROPIC_API_KEY |
| Large notes exceed context | Low | Truncate note content to 2000 chars in prompt |

## Security

- ANTHROPIC_API_KEY read from environment only, never hardcoded
- No file writes — this is a read-only classifier
- Note content sent to Anthropic API (same as existing Claude CLI usage)
