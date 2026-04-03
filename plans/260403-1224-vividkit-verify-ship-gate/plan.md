---
title: VividKit Verify + Ship Gate
status: complete
priority: high
created: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 5)
---

# VividKit Verify + Ship Gate

Upgrade `post-ship-runner.ts` to use `/ck:ship --official` as the PRIMARY verify + PR path. Replace old verifier review + manual `createPullRequest()` with a single `/ck:ship` command that includes: merge main, run tests, 2-pass review (standard + red-team), bump version, changelog, push, create PR. On failure, FALLBACK to `branch-manager.ts` `createPullRequest()` (kept untouched). Add `/ck:scout` for edge cases and `/ck:predict` for large changes before shipping.

## Current State

`post-ship-runner.ts` runs this pipeline:
1. `executeVerify()` — custom 2-pass review (standard + red-team), FAIL stops pipeline
2. `executeSecurityFlow()` — red testing when "security" label present
3. `executeE2e()` — E2E tests, FAIL stops pipeline
4. `executeDesignReview()` — advisory
5. `executeSlackReport()` — advisory
6. `executeJournal()` — advisory
7. `invokeClaudePhase('/ck:llms')` — docs generation
8. `recordRun()` — file write

PR creation currently lives in `branch-manager.ts` `createPullRequest()` and is called from `watch-command.ts` AFTER post-ship completes. The post-ship runner itself never creates PRs.

## Target State

```
post-ship-runner.ts:
  │
  ├── GREEN: test-flow (already wired in security-flow plan)
  ├── RED: security-flow (already wired, advisory)
  │
  ├── /ck:scout → edge case discovery (NEW)
  ├── /ck:predict → 5-persona debate for large changes (NEW, conditional)
  │
  ├── TRY: /ck:ship --official (NEW — replaces verify + createPullRequest)
  │   └── SUCCESS → PASS, log "shipped via /ck:ship"
  │
  ├── CATCH: /ck:ship failed
  │   └── FALLBACK: createPullRequest() from branch-manager.ts
  │       └── SUCCESS → PASS, log "shipped via fallback"
  │       └── FAIL → FAIL, log "both paths failed"
  │
  ├── slack-reporter → report result
  ├── journal-writer → vault
  ├── /ck:llms → docs generation
  └── recordRun()
```

## Key Decisions

1. **`/ck:ship --official` replaces BOTH `executeVerify()` AND `createPullRequest()`** — ship command includes test + 2-pass review + version bump + changelog + PR creation
2. **`branch-manager.ts` stays UNTOUCHED** — `createPullRequest()` is fallback safety net
3. **`verifier.ts` stays UNTOUCHED** — still importable for other uses, just not called in main post-ship path
4. **PASS = ship or fallback PR succeeded. FAIL = both failed**
5. **Log which path was used** for debugging/observability

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-verify-ship-gate.md) | `types.ts`, `model-router.ts`, `post-ship-runner.ts` | Complete |

## Files Modified

- `src/commands/watch/types.ts` — add `'ship'` and `'predict'` to PhaseType
- `src/commands/watch/phases/model-router.ts` — add `ship` and `predict` phase configs
- `src/commands/watch/phases/post-ship-runner.ts` — rewrite verify gate: scout → predict → ship → fallback

## Files NOT Modified (by design)

- `src/commands/watch/phases/branch-manager.ts` — untouched, fallback safety
- `src/commands/watch/phases/verifier.ts` — untouched, available for other uses

## Success Criteria

- [x] `/ck:ship --official` is primary verify + PR path
- [x] On failure, falls back to `createPullRequest()` from branch-manager.ts
- [x] `/ck:scout` runs before ship for edge case discovery
- [x] `/ck:predict` runs for large changes (hardMode flag)
- [x] Logs which path was used ("shipped via /ck:ship" or "shipped via fallback")
- [x] PASS = PR created via either path. FAIL = both failed
- [x] `npm run build` compiles without errors

## Cook Command

```bash
claude -p "/ck:cook --auto @plans/260403-1224-vividkit-verify-ship-gate/plan.md" \
  --model sonnet --output-format text --dangerously-skip-permissions
```
