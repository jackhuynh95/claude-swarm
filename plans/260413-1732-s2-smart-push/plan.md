---
status: complete
created: 2026-04-13
phase: S2
track: secondary
blockedBy: []
blocks: []
---

# S2 — Smart Push: Inject Relevant Global Knowledge Into Project

## Overview

- **Priority**: Secondary (global/shared mode)
- **Status**: Complete
- **Goal**: Create `src/commands/sync/smart-push.ts` + `src/commands/sync/relevance-filter.ts` — read shared second-brain notes, filter relevance to a given project context via Claude sonnet, inject only useful notes into project vault. Project-inside notes remain primary source.

## Key Design Decisions

1. **Two files** — `relevance-filter.ts` (Claude sonnet scoring) + `smart-push.ts` (orchestration). Mirrors `note-classifier.ts` + `smart-pull.ts` split. Each stays under 200 LOC.
2. **Sonnet for relevance** — needs context understanding, not just promote/skip classification.
3. **Project-inside notes are primary** — smart-push injects to `Notes/` but never overwrites existing project knowledge.
4. **Frontmatter markers** — `injected-from: second-brain` + `injected-for: "context"` prevent re-promotion by smart-pull.
5. **Cycle guard** — uses existing `acquireCycleLock(vaultPath, 'push')`.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Relevance filter + smart-push implementation | `phase-01-smart-push-implementation.md` | Pending |

## Key Dependencies

- `note-classifier.ts` — reuse `NoteInput` type, `extractJson` pattern (complete)
- `frontmatter-parser.ts` — `buildFrontmatter`, `parseFrontmatter`, `isInjectedNote` (complete)
- `cycle-guard.ts` — `acquireCycleLock('push')`, `releaseCycleLock` (complete)
- Second-brain at `../second-brain/` with `_lessons/`, `_patterns/`, `_decisions/`

## Cook Command

```bash
/ck:cook --auto /Users/jackhuynh/Documents/GitHub/claude-swarm/plans/260413-1732-s2-smart-push/plan.md
```
