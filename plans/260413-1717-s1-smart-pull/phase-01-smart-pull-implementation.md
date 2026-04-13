---
phase: 1
status: complete
priority: high
effort: medium
completed: 2026-04-13
---

# Phase 1 — Smart Pull Implementation

## Context Links

- Roadmap: `docs/implement-roadmap-smart-vault-sync.md` (S1 section)
- Classifier: `src/commands/sync/note-classifier.ts`
- Frontmatter: `src/commands/sync/frontmatter-parser.ts`
- Cycle guard: `src/commands/sync/cycle-guard.ts`
- Knowledge writer: `src/commands/sync/knowledge-writer.ts` (reference for category→dir mapping)

## Overview

Create `src/commands/sync/smart-pull.ts` — the secondary/global sync module that promotes proven reusable notes from a project vault into the shared second-brain.

## Key Insights

- Existing `note-classifier.ts` handles batch classification via haiku — reuse directly
- `frontmatter-parser.ts` already has `isInjectedNote()` and `isSyncedNote()` guards
- `ProvenanceFrontmatter` already defines `source-project`, `injected-from`, `synced-at` fields
- Category→dir mapping for second-brain: `lesson→_lessons/`, `pattern→_patterns/`, `decision→_decisions/`, `foundation→_lessons/`
- Cycle guard prevents pull→push chaining in same cycle

## Requirements

### Functional
1. Scan project vault dirs: `Daily/`, `Notes/`, `Decisions/`, `Knowledge/Lessons/`, `Knowledge/Patterns/`, `Knowledge/Decisions/`
2. Skip notes already in second-brain (filename match)
3. Skip notes with `injected-from` frontmatter (came from second-brain)
4. Skip notes already synced (`synced-at` present + same filename in brain)
5. Batch classify remaining notes via `classifyNotes()` (haiku)
6. Copy "promote" notes to `{brainPath}/{category}/` with provenance frontmatter prepended
7. Log skipped notes with reason
8. Dry-run mode: log what would happen, copy nothing
9. Return structured result: promoted count, skipped count, details

### Non-Functional
- Never throw — best-effort, log errors
- Respect cycle guard (acquire lock before pull, release after)
- Single file, under 200 lines

## Architecture

```
smartPull(opts) →
  1. acquireCycleLock(vaultPath, 'pull')
  2. scanProjectVault(vaultPath) → NoteInput[]
  3. filterAlreadySynced(notes, brainPath) → NoteInput[]
  4. filterInjectedNotes(notes) → NoteInput[]
  5. classifyNotes(remaining, { projectName }) → ClassificationResult
  6. for each "promote":
     - buildFrontmatter({ source-project, promoted-date, synced-at, ... })
     - prepend frontmatter to note content
     - copy to brainPath/{category}/
  7. releaseCycleLock(vaultPath)
  8. return SmartPullResult
```

## Related Code Files

### Modify
- None (new file only)

### Create
- `src/commands/sync/smart-pull.ts`

## Implementation Steps

1. **Define types**: `SmartPullOptions` (vaultPath, brainPath, projectName, dryRun) and `SmartPullResult` (promoted, skipped, details array)

2. **Category→brain dir map**: `lesson→_lessons/`, `pattern→_patterns/`, `decision→_decisions/`, `foundation→_lessons/`, `project-specific→null` (skip)

3. **scanProjectVault()**: Read `.md` files from `Daily/`, `Notes/`, `Decisions/`, `Knowledge/Lessons/`, `Knowledge/Patterns/`, `Knowledge/Decisions/`. Return `NoteInput[]` with filename+content.

4. **filterAlreadySynced()**: List all `.md` filenames in `brainPath/_lessons/`, `_patterns/`, `_decisions/`. Strip date prefix for matching. Skip notes whose slug already exists in brain.

5. **filterByFrontmatter()**: Parse each note's frontmatter. Skip if `injected-from` is set (came from brain). Skip if `synced-at` is set AND filename already in brain.

6. **promoteToBrain()**: For each "promote" classification:
   - Determine target dir from category
   - Build provenance frontmatter: `source-project`, `promoted-date` (today), `synced-at` (ISO now), `classified-by: haiku`, `classification-reason`
   - If note already has frontmatter, merge (add fields). If not, prepend new block.
   - Write to `brainPath/{category}/{filename}`
   - In dry-run: log only, don't write

7. **smartPull()** main function:
   - Acquire cycle lock
   - Scan → filter synced → filter injected → classify → promote
   - Release lock
   - Return result

8. **Add `promoted-date` to `ProvenanceFrontmatter`** in `frontmatter-parser.ts` — new optional field for tracking when a note was promoted to global brain.

## Todo List

- [x] Add `promoted-date` field to `ProvenanceFrontmatter` interface in `frontmatter-parser.ts`
- [x] Add `promoted-date` parsing in `parseFrontmatter()` switch case
- [x] Add `promoted-date` to `buildFrontmatter()` output
- [x] Create `src/commands/sync/smart-pull.ts` with types and constants
- [x] Implement `scanProjectVault()` — read .md from vault subdirs
- [x] Implement `filterAlreadyInBrain()` — skip by filename match in brain dirs
- [x] Implement frontmatter filtering — skip injected + already-synced
- [x] Implement `promoteToBrain()` — write promoted notes with provenance
- [x] Implement `smartPull()` main orchestrator with cycle guard
- [x] Implement dry-run mode (log only, no writes)

## Success Criteria

- `smartPull({ vaultPath, brainPath, projectName })` promotes only reusable notes
- Project-specific notes are skipped with logged reason
- Injected notes (from brain) are never re-promoted
- Already-synced notes are skipped
- Promoted notes have `source-project`, `promoted-date`, `synced-at` frontmatter
- Dry-run shows planned actions without writing
- Cycle guard prevents pull→push chaining
- File stays under 200 lines

## Risk Assessment

- **Low**: Haiku misclassifies a note → acceptable, can re-run or manually override
- **Low**: Filename collision in brain → use date-prefix slug to minimize
- **Mitigated**: Infinite loop → `isInjectedNote()` + cycle guard prevent re-promotion

## Security Considerations

- No user input paths — all vault/brain paths are configured
- No shell injection risk — uses `fs` APIs only
- ANTHROPIC_API_KEY required for classifier (already handled in note-classifier)
