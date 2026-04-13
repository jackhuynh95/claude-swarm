---
status: done
created: 2026-04-13
scope: P2 — Project Knowledge Capture
mode: fast
blockedBy: []
blocks: [260413-1615-p1-note-classifier]
---

# P2 — Project Knowledge Capture

## Overview

Capture reusable lessons inside the current project vault before any global/shared promotion. Extend vault structure with `Knowledge/Lessons`, `Knowledge/Patterns`, `Knowledge/Decisions`. Teach journal-writer, run-recorder, and roadmap-loader to feed knowledge capture. Store provenance in frontmatter.

**Priority**: P2 (primary-first, inside current target project only)
**Depends on**: P1 note-classifier (complete)

## Current State

```
journal-writer.ts   → Daily/{date}.md + Notes/{name}.md (via Claude prompt)
run-recorder.ts     → Review/Runs/{date}-issue-{N}.md (direct file write)
vault-context-loader.ts → reads Notes/ only (keyword matching)
epic-executor.ts    → plan → cook → commit → checklist. No lesson capture.
note-classifier.ts  → classifies notes: promote/skip + category (P1 complete)
```

## Target State

```
journal-writer.ts   → Daily/ + Notes/ + triggers knowledge-writer for lessons
run-recorder.ts     → Review/Runs/ + triggers knowledge-writer for lessons
epic-executor.ts    → plan → cook → LESSON CAPTURE → commit → checklist
knowledge-writer.ts → NEW: classifies + writes to Knowledge/{category}/
                       frontmatter: issue, project, date, source-phase, category
```

## Vault Structure (new directories)

```
obsidian-vault/
├── Daily/          (existing)
├── Notes/          (existing)
├── Decisions/      (existing)
├── Review/Runs/    (existing)
└── Knowledge/      (NEW)
    ├── Lessons/    (reusable insights, gotchas)
    ├── Patterns/   (reusable code/arch patterns)
    └── Decisions/  (arch decisions, standards)
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Create knowledge-writer module](./phase-01-knowledge-writer.md) | Done |
| 2 | [Update journal-writer to feed knowledge capture](./phase-02-journal-writer-integration.md) | Done |
| 3 | [Add lesson capture to executeFromRoadmap](./phase-03-roadmap-loader-lesson-capture.md) | Done |

## Dependencies

- `note-classifier.ts` — P1 (complete), used for classification
- `@anthropic-ai/sdk` — already installed
- No new npm deps needed

## Cook Command

```bash
/ck:cook --auto plans/260413-1625-p2-project-knowledge-capture/phase-01-knowledge-writer.md
```
