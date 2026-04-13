---
phase: 1
status: complete
priority: high
effort: medium
---

# Phase 1 — Relevance Filter + Smart Push Implementation

## Context Links

- Roadmap: `docs/implement-roadmap-smart-vault-sync.md` (S2 section)
- Mirror pattern: `src/commands/sync/smart-pull.ts` (167 LOC)
- Classifier pattern: `src/commands/sync/note-classifier.ts` (214 LOC)
- Shared frontmatter: `src/commands/sync/frontmatter-parser.ts`
- Cycle guard: `src/commands/sync/cycle-guard.ts`
- Second-brain location: `../second-brain/` — dirs: `_lessons/`, `_patterns/`, `_decisions/`

## Overview

Create two files that inject relevant global/shared knowledge from second-brain into a project vault:

1. **`src/commands/sync/relevance-filter.ts`** (~120 LOC) — Claude sonnet relevance scoring
2. **`src/commands/sync/smart-push.ts`** (~150 LOC) — orchestration: scan, filter, inject

## Key Insights

- `smart-pull` promotes project notes TO brain. `smart-push` injects brain notes INTO project. Reverse direction.
- Relevance needs **sonnet** (context understanding) vs **haiku** (simple classify). Different model, prompt, schema.
- `frontmatter-parser.ts` already supports `injected-from` field — no changes needed there.
- Cycle guard already supports `'push'` operation type.
- Notes with `source-project` matching current project should be skipped (already came from this project).

## Architecture

```
smart-push --context "Add analytics dashboard":
  1. acquireCycleLock(vaultPath, 'push')
  2. Scan second-brain: _lessons/, _patterns/, _decisions/
  3. Skip notes already in project vault Notes/ (filename match)
  4. Skip notes with source-project == this project (frontmatter check)
  5. Batch relevance filter via Claude sonnet with context
  6. Copy relevant notes → project vault Notes/
  7. Add frontmatter: injected-from, injected-for, synced-at
  8. releaseCycleLock
```

## Related Code Files

### Create

- `src/commands/sync/relevance-filter.ts`
- `src/commands/sync/smart-push.ts`

### Read (reference only)

- `src/commands/sync/smart-pull.ts` — mirror pattern
- `src/commands/sync/note-classifier.ts` — API call pattern, extractJson, retry
- `src/commands/sync/frontmatter-parser.ts` — buildFrontmatter, parseFrontmatter
- `src/commands/sync/cycle-guard.ts` — acquireCycleLock, releaseCycleLock

## Implementation Steps

### File 1: `src/commands/sync/relevance-filter.ts`

**Purpose**: Given a context string and a batch of notes, use Claude sonnet to score relevance.

1. Define `RelevanceResult` interface:
   ```ts
   interface RelevanceResult {
     filename: string;
     relevant: boolean;   // true = inject, false = skip
     reason: string;      // why relevant or not
     score: number;       // 0-10 confidence
   }
   ```

2. Define `RelevanceBatchResult`:
   ```ts
   interface RelevanceBatchResult {
     results: RelevanceResult[];
     model: string;
     inputTokens: number;
     outputTokens: number;
   }
   ```

3. System prompt for relevance scoring:
   ```
   You are a knowledge relevance filter for a software project.
   Given a task context and a list of knowledge notes, classify each note:
   - "relevant" if the note contains patterns, lessons, or decisions
     that would help with the given task context
   - "not relevant" if the note is about unrelated technologies,
     different problem domains, or wouldn't help with this task
   
   Score relevance 0-10 (0 = completely unrelated, 10 = directly applicable).
   A note is relevant if score >= 5.
   
   Output JSON: { "results": [{ "filename", "relevant", "reason", "score" }] }
   ```

4. Use model `claude-sonnet-4-5-20250514` (default). Accept override via options.

5. Implement `filterByRelevance(context: string, notes: NoteInput[], opts?)`:
   - Truncate each note to 2000 chars (same as note-classifier)
   - Max batch size: 15 (sonnet is more expensive, keep batches smaller)
   - Build user message with context + note blocks
   - Call Claude, parse JSON, validate with zod
   - Retry once on parse failure (same pattern as note-classifier)
   - Return `RelevanceBatchResult`

6. Export types and `filterByRelevance` function.

### File 2: `src/commands/sync/smart-push.ts`

**Purpose**: Orchestrate reading brain, filtering, and injecting into project vault.

1. Define interfaces:
   ```ts
   interface SmartPushOptions {
     vaultPath: string;    // project vault root
     brainPath: string;    // shared second-brain root
     projectName: string;  // for frontmatter + skip logic
     context: string;      // task/issue context for relevance
     dryRun?: boolean;
   }
   
   interface SmartPushDetail {
     filename: string;
     action: 'injected' | 'skipped';
     reason: string;
     score?: number;
     sourcePath?: string;
   }
   
   interface SmartPushResult {
     injected: number;
     skipped: number;
     details: SmartPushDetail[];
   }
   ```

2. Constants:
   ```ts
   const BRAIN_SCAN_DIRS = ['_lessons', '_patterns', '_decisions'];
   const PROJECT_INJECT_DIR = 'Notes';  // inject into project Notes/
   ```

3. Helper `scanBrainDir(dirPath)` — read .md files, return `NoteInput[]` (same pattern as smart-pull's `scanDir`).

4. Helper `getProjectFilenames(vaultPath)` — scan `Notes/` dir, return `Set<string>` of lowercase filenames (skip already-injected).

5. Filter functions (sequential pipeline):
   - `filterAlreadyInProject(notes, projectFiles)` — skip by filename match
   - `filterBySourceProject(notes, projectName)` — parse frontmatter, skip if `source-project === projectName` (note originated from this project)

6. Main `smartPush(opts)` function:
   - Acquire cycle lock: `acquireCycleLock(vaultPath, 'push')`
   - If denied: return early with `cycle guard denied` detail
   - Scan all BRAIN_SCAN_DIRS
   - Pipeline: filterAlreadyInProject → filterBySourceProject → filterByRelevance
   - For each relevant note:
     - Build frontmatter with `injected-from: second-brain`, `injected-for: "context"`, `synced-at`
     - If note has existing frontmatter: merge fields. If not: prepend new block.
     - Write to `{vaultPath}/Notes/{filename}`
     - Log action
   - Release cycle lock in `finally` block
   - Return `SmartPushResult`

7. Frontmatter injection fields:
   ```ts
   {
     'injected-from': 'second-brain',
     'injected-for': context.slice(0, 100),  // truncate long contexts
     'synced-at': new Date().toISOString(),
   }
   ```

8. Reuse `mergeFrontmatter` pattern from smart-pull for notes that already have frontmatter. Or use `hasFrontmatter` + `buildFrontmatter` from `frontmatter-parser.ts`.

## Todo List

- [x] Create `src/commands/sync/relevance-filter.ts` — zod schema, system prompt, `filterByRelevance` function
- [x] Create `src/commands/sync/smart-push.ts` — interfaces, scan helpers, filter pipeline, `smartPush` orchestrator
- [x] Verify cycle guard integration — `acquireCycleLock(vaultPath, 'push')` denies if pull lock active
- [x] Verify frontmatter markers — `injected-from: second-brain` prevents re-promotion by smart-pull
- [x] Verify skip logic — notes with `source-project == projectName` get skipped
- [x] Verify dry-run mode — logs actions without writing files
- [x] Run `npx tsc --noEmit` to verify compilation

## Success Criteria

- `smartPush({ context: "Add analytics", ... })` reads brain notes, filters by relevance, injects only useful ones
- Notes already in project vault are skipped (no duplicates)
- Notes that originated from this project are skipped (no circular injection)
- Cycle guard prevents push if pull lock is active
- Injected notes have `injected-from: second-brain` frontmatter (smart-pull will skip them)
- Dry-run mode produces log output but no file writes
- Both files compile cleanly with `npx tsc --noEmit`

## Risk Assessment

- **Sonnet cost**: batches of 15 notes per call. If brain has 100+ notes, that's ~7 calls. Acceptable for an optional secondary operation.
- **Context quality**: garbage context = garbage relevance. Caller must provide meaningful context string.
- **No test for brain absence**: if `../second-brain/` doesn't exist, scan returns empty arrays gracefully (same pattern as smart-pull).

## Security Considerations

- No user input goes directly to filesystem paths — brain/vault paths come from config
- Context string is truncated in frontmatter to prevent injection
- API key read from `process.env['ANTHROPIC_API_KEY']` (same as note-classifier)
