---
phase: 1
title: Provenance Frontmatter Standardization
status: complete
priority: high
effort: small
---

# Phase 1 — Provenance Frontmatter Standardization

## Context Links

- Roadmap: `docs/implement-roadmap-smart-vault-sync.md` (P4 section)
- P2 plan: `plans/260413-1625-p2-project-knowledge-capture/plan.md` (done)
- knowledge-writer: `src/commands/sync/knowledge-writer.ts`
- cook-lesson-extractor: `src/commands/sync/cook-lesson-extractor.ts`

## Overview

Create shared frontmatter types and parser. Update all knowledge writers to emit standardized provenance fields. Every artifact must be attributable to source-project, issue, task, source-phase, and have a `synced-at` timestamp.

## Key Insights

- `knowledge-writer.ts` uses `project` — sync phases (S1/S2) expect `source-project`. Add both for compatibility.
- `cook-lesson-extractor.ts` run summaries lack `project`, `issue`, `source-phase`. Need full provenance.
- Shared parser avoids duplication between vault-context-loader and knowledge-extractor.
- `synced-at` = ISO timestamp when note was classified/written. Future smart-pull uses this to skip already-synced.

## Related Code Files

### Files to create
- `src/commands/sync/frontmatter-parser.ts` — shared parser + types

### Files to modify
- `src/commands/sync/knowledge-writer.ts` — add `synced-at`, `source-project`, `task-id` to frontmatter
- `src/commands/sync/cook-lesson-extractor.ts` — use full provenance in run summaries
- `src/commands/sync/knowledge-writer.ts` — update `KnowledgeMetadata` interface with `taskId?`

## Architecture

```
ProvenanceFrontmatter (shared type):
  source-project: string     # project name (e.g. "medusa")
  issue?: number              # GitHub issue number
  task-id?: string            # task identifier (e.g. "1.2")
  source-phase: string        # "journal" | "run-record" | "cook" | "plan"
  date: string                # YYYY-MM-DD
  synced-at: string           # ISO timestamp when written/classified
  category: string            # "lesson" | "pattern" | "decision"
  tags: string[]              # searchable tags
  classified-by?: string      # model used (e.g. "haiku")
  injected-from?: string      # skip marker: "second-brain" if injected
  classification-reason?: string

frontmatter-parser.ts:
  parseFrontmatter(content) → ProvenanceFrontmatter
  hasFrontmatter(content) → boolean
  isInjectedNote(content) → boolean    # checks injected-from
  isSyncedNote(content) → boolean      # checks synced-at exists
  buildFrontmatter(meta) → string      # replaces inline builder in knowledge-writer
```

## Implementation Steps

1. Create `src/commands/sync/frontmatter-parser.ts`:
   - Define `ProvenanceFrontmatter` interface with all fields (all optional except `date`)
   - `parseFrontmatter(content: string): ProvenanceFrontmatter` — regex-based YAML parser, never throws
   - `hasFrontmatter(content: string): boolean`
   - `isInjectedNote(content: string): boolean` — returns true if `injected-from` exists
   - `isSyncedNote(content: string): boolean` — returns true if `synced-at` exists
   - `buildFrontmatter(meta: ProvenanceFrontmatter): string` — generates YAML frontmatter string

2. Update `src/commands/sync/knowledge-writer.ts`:
   - Add `taskId?: string` to `KnowledgeMetadata` interface
   - Replace inline `buildFrontmatter()` with import from `frontmatter-parser.ts`
   - Add `synced-at: new Date().toISOString()` to written frontmatter
   - Add `source-project` field (same value as `project`, for sync compatibility)

3. Update `src/commands/sync/cook-lesson-extractor.ts`:
   - Import `buildFrontmatter` from `frontmatter-parser.ts`
   - Update `writeTaskRunSummary()` to include full provenance:
     `source-project`, `issue` (from metadata), `task-id`, `source-phase: "cook"`, `synced-at`
   - Pass `KnowledgeMetadata` with `taskId` set when calling `captureKnowledge()`

4. Update callers that construct `KnowledgeMetadata`:
   - `knowledge-extractor.ts` `extractKnowledge()` — no change needed (already correct fields)
   - `cook-lesson-extractor.ts` `extractLessonsFromCook()` — pass `taskId` in metadata

## Todo List

- [x] Create `frontmatter-parser.ts` with `ProvenanceFrontmatter` type and parser functions
- [x] Update `knowledge-writer.ts` to use shared builder, add `synced-at` + `source-project` + `taskId`
- [x] Update `cook-lesson-extractor.ts` run summaries with full provenance
- [x] Verify build compiles with `npx tsc --noEmit`

## Success Criteria

- All Knowledge/ artifacts written after this change contain: `source-project`, `date`, `source-phase`, `synced-at`
- Cook run summaries contain full provenance (not just `date`, `task`, `epic`)
- `frontmatter-parser.ts` under 120 lines
- Existing tests pass, build compiles

## Risk Assessment

- **Low risk**: additive changes only — new fields in frontmatter, new utility module
- **Backward compat**: existing notes without new fields still parse correctly (all fields optional in parser)
- No runtime behavior change — just richer metadata

## Next Steps

- Phase 2 uses `frontmatter-parser.ts` for skip guards in knowledge-extractor and vault-context-loader
