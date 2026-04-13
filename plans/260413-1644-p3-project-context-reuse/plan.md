---
status: complete
created: 2026-04-13
scope: P3 — Project Context Reuse
mode: fast
blockedBy: [260413-1625-p2-project-knowledge-capture]
blocks: []
---

# P3 — Project Context Reuse

## Overview

Upgrade `vault-context-loader.ts` for local-first retrieval. Read curated `Knowledge/` notes before raw `Notes/`. Rank by task relevance, recency, and category priority. Inject project-inside context before watcher `/ck:plan` and roadmap-loader `/ck:cook`. No dependency on global/shared notes.

**Priority**: P3 (primary-first)
**Depends on**: P2 knowledge capture (done — `Knowledge/` directories + writer exist)

## Current State

```
vault-context-loader.ts
  - reads ONLY Notes/ directory
  - simple keyword matching from GHIssue (title + body)
  - score = keywordMatches * 2 + recency (binary: 1 if <30d, else 0)
  - 2000 char max context
  - only consumed by ship-flow.ts (watcher path)
  - epic-executor.ts does NOT use vault context before planning

Knowledge/ structure (P2 complete):
  Knowledge/Lessons/   — reusable insights
  Knowledge/Patterns/  — reusable code/arch patterns
  Knowledge/Decisions/ — arch decisions, standards
```

## Target State

```
vault-context-loader.ts
  - reads Knowledge/ first (Lessons, Patterns, Decisions)
  - then reads Notes/ as fallback/supplement
  - generalized input: accepts { title, description } instead of GHIssue only
  - category priority: patterns (3) > decisions (2) > lessons (1) > raw notes (0)
  - recency: graduated scoring (7d=3, 14d=2, 30d=1, >30d=0)
  - relevance: keyword matches + frontmatter tag matching
  - 3000 char max (increased for richer context)
  - consumed by BOTH ship-flow.ts AND epic-executor.ts
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Upgrade vault-context-loader with Knowledge-first retrieval](./phase-01-upgrade-vault-context-loader.md) | Complete |
| 2 | [Wire epic-executor to inject vault context before plan/cook](./phase-02-wire-epic-executor.md) | Complete |

## Dependencies

- `knowledge-writer.ts` — P2 (done), writes to Knowledge/{category}/
- `note-classifier.ts` — P1 (done)
- No new npm deps needed

## Cook Command

```bash
/ck:cook --auto plans/260413-1644-p3-project-context-reuse/phase-01-upgrade-vault-context-loader.md
```
