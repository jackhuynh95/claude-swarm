# Phase 2: Issue Router (Replace CK Brain)

**Created**: 2026-04-01
**Status**: Ready
**Priority**: High
**Mode**: Fast
**blockedBy**: [260401-1704-phase-0-1-foundation-ck-migration]

---

## Overview

Replace CK's single-track `/ck:cook` dispatch with multi-track routing. Create `issue-router.ts` for label + type detection and `model-router.ts` for per-phase model selection (opus/sonnet/haiku). Wire into the watch command poll cycle.

## Current State

- `src/index.ts` — CLI entry with commander
- `src/commands/watch/watch-command.ts` — placeholder (11 LOC, TODO for Phase 2)
- No `types.ts`, no `phases/` directory, no routing logic
- `docs/agent-token-budget-guide.md` — model routing rules defined
- ESM project with TypeScript, uses `@octokit/rest` for GitHub API

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Types & Interfaces | [phase-01-types.md](phase-01-types.md) | Pending |
| 2 | Issue Router | [phase-02-issue-router.md](phase-02-issue-router.md) | Pending |
| 3 | Model Router | [phase-03-model-router.md](phase-03-model-router.md) | Pending |
| 4 | Watch Integration | [phase-04-watch-integration.md](phase-04-watch-integration.md) | Pending |

## Dependencies

- Phase 0+1 must be complete (project builds, CK source available)
- `@octokit/rest` for GitHub API (already in package.json)

## Success Criteria

- [ ] `types.ts` defines GHIssue, ClassifiedIssue, IssueState, PhaseConfig, FlowType
- [ ] `issue-router.ts` classifies issues by title prefix + labels
- [ ] `model-router.ts` returns model/effort/maxTurns per phase
- [ ] `watch-command.ts` polls issues and routes through the router
- [ ] `npm run build` compiles without errors
- [ ] [BUG] → debug-flow, [FEATURE] → ship-flow, [DOCS/CHORE] → ship-flow --no-test
- [ ] "hard" label → opus override, "frontend" label → design-review flag

## Estimated Effort

~2-3 hours (4 files, ~400 LOC total)
