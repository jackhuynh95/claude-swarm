---
phase: 1
priority: high
status: complete
effort: small
planDir: plans/260413-1704-p6-builder-roadmap-memory
---

# Phase 1: Wire Cycle Guard + Knowledge Extraction Into Epic Executor

## Context

- [epic-executor.ts](../../src/commands/build/epic-executor.ts) — target file
- [cycle-guard.ts](../../src/commands/sync/cycle-guard.ts) — acquireCycleLock/releaseCycleLock
- [knowledge-extractor.ts](../../src/commands/sync/knowledge-extractor.ts) — extractFromRecentNotes
- [P5 plan (complete)](../260413-1658-p5-watcher-cycle-guard/plan.md) — watcher already uses cycle guard

## Overview

Three small changes to `executeFromRoadmap()` in `epic-executor.ts`:
1. Cycle guard around vault context load (push lock)
2. Knowledge extraction after commit (pull lock)
3. Release cycle lock at end of each task

## Key Insights

- `extractLessonsFromCook()` (line 461) already handles lesson capture from cook stdout — do NOT duplicate
- `extractFromRecentNotes()` is a different function — it scans Notes/ for recently-modified .md files and promotes them to Knowledge/. This catches notes written by cook/plan that aren't in stdout.
- Cycle guard is best-effort — denied lock = skip, never block pipeline
- Each task iteration is one cycle — acquire at start, release at end

## Related Code Files

**Modify:**
- `src/commands/build/epic-executor.ts` — add 2 imports + ~20 lines

**Read-only (already exist):**
- `src/commands/sync/cycle-guard.ts`
- `src/commands/sync/knowledge-extractor.ts`
- `src/commands/sync/knowledge-writer.ts`

## Implementation Steps

### Step 1: Add imports (epic-executor.ts, top of file)

Add after existing sync imports (line 9):

```typescript
import { acquireCycleLock, releaseCycleLock } from '../sync/cycle-guard.js';
import { extractFromRecentNotes } from '../sync/knowledge-extractor.js';
```

### Step 2: Wrap vault context load in push lock (line ~429)

Replace the current vault context block:

```typescript
// BEFORE (current):
let vaultCtx = '';
try {
  vaultCtx = await loadVaultContext(vaultPath, { title: issue.title });
} catch { /* swallow */ }

// AFTER:
let vaultCtx = '';
try {
  const pushAllowed = await acquireCycleLock(vaultPath, 'push');
  if (pushAllowed) {
    vaultCtx = await loadVaultContext(vaultPath, { title: issue.title });
  }
} catch { /* swallow */ }
```

### Step 3: Add knowledge extraction after commit (after line ~477)

After the commit step succeeds, add knowledge extraction with pull lock:

```typescript
// After commit step, before completed++ :
try {
  const pullAllowed = await acquireCycleLock(vaultPath, 'pull');
  if (pullAllowed) {
    const parts = roadmapPath.replace(/\\/g, '/').split('/');
    const project = parts.length > 1 ? (parts[parts.length - 2] ?? 'unknown') : 'unknown';
    await extractFromRecentNotes(vaultPath, {
      project,
      sourcePhase: 'cook',
      date: new Date().toISOString().slice(0, 10),
      taskId: issue.id,
    });
  }
} catch { /* swallow — best-effort */ }
```

### Step 4: Release cycle lock at end of each task iteration

At the bottom of the for-loop body (after both success and failure paths), add:

```typescript
// Release cycle lock — one cycle per task
await releaseCycleLock(vaultPath).catch(() => {});
```

Place this AFTER the `if (result.success) { ... } else { ... }` block, so it runs regardless of success/failure.

## Todo List

- [x] Add imports for cycle-guard and knowledge-extractor
- [x] Wrap loadVaultContext in acquireCycleLock('push')
- [x] Add extractFromRecentNotes after commit with acquireCycleLock('pull')
- [x] Add releaseCycleLock at end of task iteration
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- `npx tsc --noEmit` passes
- Each task in `executeFromRoadmap()` loop:
  - Acquires push lock before vault context load
  - Runs extractFromRecentNotes after commit
  - Releases cycle lock at end (success or failure)
- Lesson capture from cook stdout still works (no regression)
- Pipeline never blocks on denied lock — just skips

## Risk Assessment

**Low risk** — all sync operations are best-effort with try/catch. Denied lock = skip, not fail.

## Security Considerations

None — no user input, no external APIs beyond existing Anthropic calls in knowledge-writer.
