---
status: complete
created: 2026-04-13
scope: P5 — Watcher Cycle Guard Integration
mode: fast
blockedBy: [260413-1651-p4-metadata-safety]
blocks: []
---

# P5 — Wire Cycle Guard Into Watcher

## Overview

Wire `cycle-guard.ts` into the watcher pipeline so knowledge capture (after journal + run-recorder) and knowledge retrieval (before `/ck:plan`) each enforce one-shot-per-cycle semantics. Primary/local only — no global/shared sync.

**Priority**: P5 (primary-first)
**Depends on**: P4 metadata safety (done — cycle-guard.ts, frontmatter-parser.ts exist)

## Current State

```
post-ship-runner.ts:220  → extractKnowledge() already runs after journal + run-recorder ✅
ship-flow.ts:60          → loadVaultContext() already runs before /ck:plan ✅
cycle-guard.ts           → EXISTS but NOT imported/called anywhere ❌
watch-command.ts          → no releaseCycleLock at end of processIssue ❌
```

Core capture→reuse loop works. Missing: cycle-guard enforcement + cleanup.

## Target State

```
ship-flow.ts
  → acquireCycleLock(vaultPath, 'push') before loadVaultContext
  → if denied, skip (stale context is OK — not a pipeline blocker)

post-ship-runner.ts
  → acquireCycleLock(vaultPath, 'pull') before extractKnowledge
  → if denied, skip extraction (already ran this cycle)

watch-command.ts
  → releaseCycleLock(vaultPath) at end of processIssue (finally block)
  → log "[watch] cycle-guard released"
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Wire cycle-guard into watcher pipeline](./phase-01-wire-cycle-guard.md) | Complete |

## Dependencies

- `cycle-guard.ts` — P4 (done)
- `knowledge-extractor.ts` — P2 (done)
- `vault-context-loader.ts` — P3 (done)
- No new npm deps

## Cook Command

```bash
/ck:cook --auto plans/260413-1658-p5-watcher-cycle-guard/phase-01-wire-cycle-guard.md
```
