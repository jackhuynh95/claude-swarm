---
title: VividKit Ship Flow Upgrade
status: completed
priority: high
created: 2026-04-03
completed: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 2)
---

# VividKit Ship Flow Upgrade

Upgrade `ship-flow.ts` from `plan → cook → commit → PR` to VividKit's full recipe with brainstorm, validate, scout, code-review — and **remove PR creation**. Ship-flow now ends at `commitChanges()`. PR is created later by `/ck:ship` in post-ship verify gate.

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-types-model-router.md) | `types.ts`, `model-router.ts` | Completed |
| [Phase 2](phase-02-ship-flow-upgrade.md) | `ship-flow.ts` | Completed |

## Key Changes

1. **Add `scout` and `code_review` to `PhaseType`** — new phase types for post-cook steps
2. **Add phase configs** — `scout` (sonnet/low) and `code_review` (sonnet/medium) in model-router
3. **Add optional `/ck:brainstorm`** — when issue body is short/vague (< 100 chars, no acceptance criteria)
4. **Conditional red-team** — only for `hardMode` issues (currently runs always)
5. **Add `/ck:plan validate`** — after plan creation for complex features
6. **Add `/ck:scout`** — after cook for edge case discovery
7. **Add `/ck:code-review`** — after cook for quality check
8. **Remove PR creation** — no `createPullRequest()`, no `git push`, ship-flow ends at `commitChanges()`
9. **Remove `/ck:ship`** from ship-flow — moved to post-ship verify gate
10. **Keep `createPullRequest` in `branch-manager.ts` UNTOUCHED** — used as fallback in post-ship

## Architecture

```
issue classified as FEATURE/DOCS/CHORE
  │
  ├── vague spec? (body < 100 chars, no criteria)
  │   └── /ck:brainstorm → clarify
  │
  ├── "hard" label → /ck:plan --hard → /ck:plan red-team → /ck:plan validate
  ├── default      → /ck:plan --fast
  │
  ├── /ck:cook @plan.md --auto (or --no-test for docs/chore)
  │
  ├── /ck:scout (edge cases)
  ├── /ck:code-review (quality)
  │
  └── commitChanges() ← STOP HERE
      (PR created later by /ck:ship in post-ship verify gate)
```

## Cook Command

```bash
claude -p "/ck:cook --auto @plans/260403-1201-vividkit-ship-flow-upgrade/plan.md" \
  --model sonnet --effort medium --dangerously-skip-permissions
```
