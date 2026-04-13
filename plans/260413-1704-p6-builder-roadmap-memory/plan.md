---
status: complete
created: 2026-04-13
scope: P6 — Builder / Roadmap Loader Memory Capture
mode: fast
blockedBy: [260413-1658-p5-watcher-cycle-guard]
blocks: []
---

# P6 — Builder / Roadmap Loader Memory Capture

## Overview

Wire cycle guard and post-commit knowledge extraction into `executeFromRoadmap()` in `epic-executor.ts`. Most of P6 is already implemented — lesson capture + run summary + vault context injection exist. Two gaps remain: cycle guard enforcement and knowledge extraction after commit.

**Priority**: P6 (primary-first)
**Depends on**: P5 watcher cycle guard (complete)

## Current State (Already Done)

```
epic-executor.ts:429   → loadVaultContext() before plan/cook ✅ (smart-push equivalent)
epic-executor.ts:461   → extractLessonsFromCook() after cook  ✅ (task 47)
cook-lesson-extractor  → writeTaskRunSummary() per task       ✅ (task 48)
cycle-guard.ts         → EXISTS, wired into watcher (P5)      ✅
```

## Gaps (This Plan)

```
epic-executor.ts  → NO cycle guard around vault context load (push)    ❌
epic-executor.ts  → NO extractFromRecentNotes after commit (pull)      ❌
epic-executor.ts  → NO releaseCycleLock at end of task/loop            ❌
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Wire cycle guard + knowledge extraction into epic-executor](./phase-01-wire-memory-into-executor.md) | Complete |

## Dependencies

- `cycle-guard.ts` — P4/P5 (done)
- `knowledge-extractor.ts` — P2 (done)
- `vault-context-loader.ts` — P3 (done)
- `cook-lesson-extractor.ts` — already imported in epic-executor
- No new npm deps

## Cook Command

```bash
/ck:cook --auto plans/260413-1704-p6-builder-roadmap-memory/phase-01-wire-memory-into-executor.md
```
