---
status: complete
created: 2026-04-13
completed: 2026-04-13
phase: S1
track: secondary
blockedBy: []
blocks: []
---

# S1 — Smart Pull: Promote Proven Project Notes to Global Brain

## Overview

- **Priority**: Secondary (global/shared mode)
- **Status**: Complete
- **Goal**: Create `src/commands/sync/smart-pull.ts` — scan project vault, classify notes, promote only reusable ones to shared second-brain. Skip project-specific. Preserve provenance. Support dry-run.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Smart pull implementation | `phase-01-smart-pull-implementation.md` | Complete |

## Key Dependencies

- `note-classifier.ts` — batch classify via haiku (complete)
- `frontmatter-parser.ts` — parse/build provenance frontmatter (complete)
- `cycle-guard.ts` — one-shot lock for pull/push (complete)
- Second-brain at `../second-brain/` relative to project root

## Cook Command

```bash
/ck:cook --auto /Users/jackhuynh/Documents/GitHub/claude-swarm/plans/260413-1717-s1-smart-pull/plan.md
```
