---
title: VividKit Test Flow (Green Testing)
status: complete
priority: high
created: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 3)
---

# VividKit Test Flow — Green Testing

Create `test-flow.ts` as a new phase module implementing functional ("green") testing via VividKit commands: `/ck:scenario`, `/ck:test`, `/ck:test --e2e`, `/ck:test --ui`.

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-test-flow-module.md) | `types.ts`, `model-router.ts`, `test-flow.ts` | Complete |

## Key Changes

1. **Add `scenario` and `ui_test` to `PhaseType`** — new phase types for scenario generation and UI tests
2. **Add phase configs** — `scenario` (sonnet/low) and `ui_test` (sonnet/low) in model-router
3. **Create `test-flow.ts`** — orchestrates green testing pipeline with label-based routing
4. **Wire to e2e-runner.ts** — delegates `/ck:test --e2e` to existing `executeE2e()`

## Architecture

```
test-flow.ts (new)
  │
  ├── /ck:scenario — generate BDD/Gherkin test scenarios from issue
  ├── /ck:test — run unit + integration tests (existing 'test' phase)
  │
  ├── flags.designReview? → /ck:test --ui (visual UI tests)
  ├── hasE2eScenarios?    → executeE2e() from e2e-runner.ts
  │
  └── return TestFlowResult { greenPass, results[] }
```

## Dependencies

- `types.ts` — add `scenario`, `ui_test` to PhaseType union
- `model-router.ts` — add configs for new phase types
- `e2e-runner.ts` — reuse existing `executeE2e()` + `parseE2eScenariosFromBody()`
- `claude-invoker.ts` — existing `invokeClaudePhase()` (no changes)
- `label-manager.ts` — existing `addComment()` (no changes)

## Integration Point

Called from `post-ship-runner.ts` as the GREEN testing gate (Phase 7 watcher integration). Not wired in this plan — that's a separate task.

## Cook Command

```bash
claude -p "/ck:cook --auto @plans/260403-1209-vividkit-test-flow/plan.md" \
  --model sonnet --effort medium
```
