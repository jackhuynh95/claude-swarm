# Phase 3: Execution Flows (Port Auto-Claude Logic)

**Created**: 2026-04-01
**Status**: Complete
**Priority**: High
**Mode**: Hard
**CompletedOn**: 2026-04-01

---

## Overview

Port `fix-issue.sh` and `ship-issue.sh` bash scripts into TypeScript execution flows. Create 4 new modules: `claude-invoker.ts` (subprocess spawning w/ timeout), `debug-flow.ts` (/debug -> /fix -> /test retry loop), `ship-flow.ts` (/plan:fast -> /ck:cook --auto -> PR), `label-manager.ts` (label transitions), `branch-manager.ts` (branch setup + commit + PR), and `clarifier.ts` (spec question phase).

## Current State

- `types.ts` — 14-state lifecycle, PhaseConfig, ClassifiedIssue, PhaseResult all defined
- `issue-router.ts` — classifyIssue() returns FlowType + flags
- `model-router.ts` — getPhaseConfig() + getFlowPhases() return per-phase model/effort/timeout
- `watch-command.ts` — placeholder, TODO for wiring
- ESM project, TypeScript strict, `child_process` available via Node.js stdlib
- Auto-claude scripts to port: `fix-issue.sh` (752 LOC), `ship-issue.sh` (629 LOC)

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Claude CLI Invoker | [phase-01-claude-invoker.md](phase-01-claude-invoker.md) | Complete |
| 2 | Label Manager | [phase-02-label-manager.md](phase-02-label-manager.md) | Complete |
| 3 | Branch Manager | [phase-03-branch-manager.md](phase-03-branch-manager.md) | Complete |
| 4 | Debug Flow | [phase-04-debug-flow.md](phase-04-debug-flow.md) | Complete |
| 5 | Ship Flow | [phase-05-ship-flow.md](phase-05-ship-flow.md) | Complete |
| 6 | Clarifier | [phase-06-clarifier.md](phase-06-clarifier.md) | Complete |

## Dependencies

- Phase 2 complete (issue-router.ts, model-router.ts, types.ts)
- `child_process` (Node.js stdlib) for Claude CLI spawning
- `gh` CLI for GitHub operations (labels, PRs, comments)
- `git` for branch operations

## Design Decisions

1. **Shared `claude-invoker.ts`** — both flows spawn Claude CLI. Extract into one module with SIGTERM -> 5s -> SIGKILL timeout. Matches CK's existing timeout pattern.
2. **Label + Branch as separate modules** — both flows do label transitions and branch/PR ops. DRY extraction avoids duplication.
3. **Clarifier as standalone phase** — inserted between routing and flow execution. Polls issue comments for human replies.
4. **No fallback tools** — skip Codex/OpenCode fallback from fix-issue.sh. YAGNI.
5. **No worktree mode** — CK daemon already has worktree-manager.ts. Flows assume they run in correct directory.
6. **PhaseResult as return type** — all flows return PhaseResult[] for the watcher to consume.

## Success Criteria

- [x] `claude-invoker.ts` spawns Claude CLI with model/effort/timeout, returns stdout
- [x] SIGTERM -> 5s -> SIGKILL timeout works correctly (fixed escalation bug)
- [x] `label-manager.ts` transitions labels via `gh` CLI
- [x] `branch-manager.ts` creates branches, commits, pushes, creates PRs via `gh`
- [x] `debug-flow.ts` runs /debug -> /fix -> /test with max 3 retries
- [x] `ship-flow.ts` runs /plan:fast -> /ck:cook --auto -> commit -> PR
- [x] `clarifier.ts` posts clarifying questions and polls for replies
- [x] `npm run build` compiles without errors
- [x] All modules use existing types from types.ts

## Estimated Effort

~4-6 hours (6 files, ~600-800 LOC total)
