---
phase: 2
title: Reprocessing Guards
status: complete
priority: high
effort: small
---

# Phase 2 — Reprocessing Guards

## Context Links

- Phase 1: `plans/260413-1651-p4-metadata-safety/phase-01-provenance-frontmatter.md`
- knowledge-extractor: `src/commands/sync/knowledge-extractor.ts`
- vault-context-loader: `src/commands/watch/phases/vault-context-loader.ts`
- frontmatter-parser (phase 1): `src/commands/sync/frontmatter-parser.ts`

## Overview

Add guards that prevent duplicate processing: skip notes already promoted to Knowledge/, skip injected notes, and enforce one-shot cycle rule. Use `frontmatter-parser.ts` from phase 1 for all checks.

## Key Insights

- `knowledge-extractor.ts` `extractFromRecentNotes()` scans Notes/ by mtime (5 min window). Same note can be re-classified across separate pipeline cycles.
- Fix: before classifying a Notes/ file, check if Knowledge/ already contains a note with matching slug. Skip if found.
- `injected-from` marker: notes injected from second-brain (future S2) must never be promoted back. Guard now, use later.
- Cycle guard: simple `.sync-cycle-lock` JSON file in vault root prevents pull→push chaining. P5/P6 consume this.
- `vault-context-loader.ts` should use shared `parseFrontmatter()` from frontmatter-parser instead of its inline parser.

## Related Code Files

### Files to create
- `src/commands/sync/cycle-guard.ts` — one-shot cycle lock utility

### Files to modify
- `src/commands/sync/knowledge-extractor.ts` — add slug-match + injected-from skip checks
- `src/commands/watch/phases/vault-context-loader.ts` — replace inline `parseFrontmatter` with shared import

## Architecture

```
knowledge-extractor.ts extractFromRecentNotes():
  BEFORE (current):
    scan Notes/*.md modified < 5min
    → classify each → write to Knowledge/

  AFTER:
    scan Notes/*.md modified < 5min
    → for each:
      1. parseFrontmatter → check injected-from → skip if injected
      2. derive slug → check Knowledge/{Lessons,Patterns,Decisions}/*-{slug}.md exists → skip if found
      3. classify → write to Knowledge/ (with synced-at from phase 1)

cycle-guard.ts:
  acquireCycleLock(vaultPath, operation: "pull" | "push"): boolean
    - read .sync-cycle-lock (JSON: { operation, timestamp, pid })
    - if lock exists AND operation differs AND timestamp < 5min → DENY (one-shot rule)
    - else → write lock → ALLOW
  releaseCycleLock(vaultPath): void
    - delete .sync-cycle-lock
  isCycleLocked(vaultPath): { locked: boolean; operation?: string }

vault-context-loader.ts:
  - import { parseFrontmatter } from '../sync/frontmatter-parser.js'
  - replace inline parseFrontmatter() with shared version
  - map ProvenanceFrontmatter.tags → existing tags field
  - NO behavior change, just consolidation
```

## Implementation Steps

1. Update `src/commands/sync/knowledge-extractor.ts`:
   - Import `parseFrontmatter`, `isInjectedNote` from `frontmatter-parser.ts`
   - In `extractFromRecentNotes()`, after reading file content:
     - Call `isInjectedNote(content)` → skip with log if true
     - Derive slug from filename: `toKebabCase(title)`
     - Scan Knowledge/{Lessons,Patterns,Decisions}/ for any file ending with `-{slug}.md`
     - If match found → skip with log `"already promoted: {slug}"`
   - Extract slug-match helper as private function `isAlreadyPromoted(vaultPath, slug): Promise<boolean>`

2. Create `src/commands/sync/cycle-guard.ts`:
   - `LOCK_FILE = '.sync-cycle-lock'`
   - `LOCK_TTL_MS = 5 * 60 * 1000` (5 min — same as mtime window)
   - `acquireCycleLock(vaultPath, operation)`: read lock file, check TTL + operation conflict, write if OK
   - `releaseCycleLock(vaultPath)`: delete lock file, best-effort
   - `isCycleLocked(vaultPath)`: read-only check
   - All functions never throw — best-effort with console.log

3. Update `src/commands/watch/phases/vault-context-loader.ts`:
   - Import `parseFrontmatter` from `'../../sync/frontmatter-parser.js'`
   - Remove inline `parseFrontmatter()` function (lines 50-65)
   - Map shared parser output to existing `{ tags, category }` shape used by `readKnowledgeNotes`
   - Ensure `readRawNotes` also uses shared parser for consistency (extract tags from raw notes too)
   - Run type check to confirm no regressions

## Todo List

- [x] Add slug-match + injected-from skip guards to `knowledge-extractor.ts`
- [x] Create `cycle-guard.ts` with acquire/release/check functions
- [x] Replace vault-context-loader inline parser with shared `frontmatter-parser.ts`
- [x] Verify build compiles with `npx tsc --noEmit`

## Success Criteria

- Notes already promoted to Knowledge/ are skipped on re-run (slug match)
- Notes with `injected-from` frontmatter are never classified/promoted
- `vault-context-loader.ts` uses shared parser — no inline duplication
- `cycle-guard.ts` under 60 lines
- Build compiles, no behavior regression in vault context loading

## Risk Assessment

- **Low risk**: guard logic is additive — worst case a note gets classified twice (same as before)
- **slug-match false positive**: if two notes have similar titles, slug collision could cause skip. Mitigation: slug includes date prefix from knowledge-writer filename pattern `{date}-{slug}.md`
- **vault-context-loader refactor**: swapping parser could change tag extraction. Mitigation: shared parser handles same `tags: [a, b]` format

## Security Considerations

- `.sync-cycle-lock` contains PID + timestamp, no sensitive data
- Lock file written to vault root (project-local), not shared

## Next Steps

- P5 (watcher integration) calls `acquireCycleLock()` before sync operations
- P6 (builder integration) calls `acquireCycleLock()` before task-level sync
- S1/S2 (global sync) uses `isInjectedNote()` and `source-project` checks
