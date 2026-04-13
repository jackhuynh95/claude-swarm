---
status: complete
created: 2026-04-13
scope: P4 — Primary Metadata + Safety
mode: fast
blockedBy: [260413-1625-p2-project-knowledge-capture]
blocks: []
---

# P4 — Primary Metadata + Safety

## Overview

Standardize provenance frontmatter across all knowledge writers. Add reprocessing guards to prevent duplicate classification. Ensure every local memory artifact is attributable to issue, task, project, and source phase. Lay groundwork for future sync skip logic (`injected-from`, `source-project`).

**Priority**: P4 (primary-first)
**Depends on**: P2 knowledge capture (done), P3 context reuse (done)

## Current State

```
knowledge-writer.ts buildFrontmatter():
  writes: date, category, source-phase, issue, project, tags, classified-by, classification-reason
  missing: synced-at, task-id, source-project (uses "project" — not sync-compatible)

cook-lesson-extractor.ts writeTaskRunSummary():
  writes: date, task, epic, tags
  missing: project, source-phase, issue, synced-at, source-project

knowledge-extractor.ts extractFromRecentNotes():
  uses mtime window (5 min) — can re-process same note across cycles
  no check for already-promoted notes or skip markers

vault-context-loader.ts parseFrontmatter():
  extracts: tags, category
  ignores: injected-from, source-project, synced-at (no skip logic)
```

## Target State

```
All knowledge artifacts have standardized provenance frontmatter:
  source-project, issue, task-id, source-phase, date, synced-at, category, tags

Shared frontmatter-parser.ts:
  parses ALL provenance fields + skip markers (injected-from, source-project)
  used by: vault-context-loader, knowledge-extractor, future smart-pull/push

Reprocessing guards:
  knowledge-extractor skips notes already in Knowledge/ (by slug match)
  knowledge-extractor skips notes with injected-from marker
  vault-context-loader uses shared parser (no behavior change, just consistency)

Cycle guard utility:
  simple flag file (.sync-cycle-lock) preventing pull→push chaining
  consumed by future P5/P6 watcher + builder integration
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Provenance frontmatter standardization](./phase-01-provenance-frontmatter.md) | Done |
| 2 | [Reprocessing guards](./phase-02-reprocessing-guards.md) | Done |

## Dependencies

- `knowledge-writer.ts` — P2 (done)
- `knowledge-extractor.ts` — P2 (done)
- `cook-lesson-extractor.ts` — P2 (done)
- `vault-context-loader.ts` — P3 (done)
- No new npm deps needed

## Cook Command

```bash
/ck:cook --auto plans/260413-1651-p4-metadata-safety/phase-01-provenance-frontmatter.md
```
