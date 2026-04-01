---
status: complete
created: 2026-04-01
completed: 2026-04-01
mode: fast
blockedBy: []
blocks: []
---

# Phase 6 — Safety & Reliability

**Goal**: Production-grade safety for overnight unattended runs. Strip secrets, prevent comment loops, enforce budget limits, track conversation history.

## Overview

8 tasks grouped into 5 new modules + 1 integration phase. All modules are pure utilities consumed by existing flows (ship-flow, debug-flow, post-ship-runner). No new phase types needed in types.ts.

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Comment Sanitizer | [phase-01-comment-sanitizer.md](phase-01-comment-sanitizer.md) | Complete |
| 2 | Comment Guard | [phase-02-comment-guard.md](phase-02-comment-guard.md) | Complete |
| 3 | Budget Guard | [phase-03-budget-guard.md](phase-03-budget-guard.md) | Complete |
| 4 | Cost Tracker | [phase-04-cost-tracker.md](phase-04-cost-tracker.md) | Complete |
| 5 | Conversation History | [phase-05-conversation-history.md](phase-05-conversation-history.md) | Complete |
| 6 | Integration | [phase-06-integration.md](phase-06-integration.md) | Complete |

## Architecture

```
src/commands/watch/phases/
├── comment-sanitizer.ts    ← NEW (tasks 30, 31, 32)
│   ├── stripSecrets()       — regex-based secret redaction
│   ├── truncateForGithub()  — enforce 65536 char limit
│   └── addDisclaimer()      — prepend AI disclaimer
│
├── comment-guard.ts        ← NEW (tasks 33, 34)
│   ├── isBotComment()       — detect own bot comments
│   ├── shouldSkipComment()  — loop prevention + maintainer-last
│   └── getLastComments()    — fetch recent issue timeline
│
├── budget-guard.ts         ← NEW (task 35)
│   ├── checkBudget()        — per-worker token cap check
│   ├── recordUsage()        — track tokens per issue/worker
│   └── BudgetExceeded       — error type for budget violations
│
├── cost-tracker.ts         ← NEW (task 36)
│   ├── recordRunCost()      — append to daily cost log
│   ├── generateNightlySummary() — aggregate + format
│   └── Cost log persisted to .ck-costs.json
│
├── conversation-history.ts ← NEW (task 37)
│   ├── recordPhaseOutput()  — append phase result to issue history
│   ├── getIssueHistory()    — retrieve all phases for an issue
│   └── History persisted to .ck-history.json
│
├── label-manager.ts        ← MODIFIED (wrap addComment)
└── watch-command.ts        ← MODIFIED (budget check in loop)
```

## Data Flow

```
Claude output → stripSecrets() → truncateForGithub() → addDisclaimer()
             → shouldSkipComment() gate → addComment() → GitHub

Each invocation → recordUsage() → checkBudget() gate
              → recordPhaseOutput() → conversation-history.json
              → recordRunCost() → cost-tracker.json

Nightly cron → generateNightlySummary() → Slack/stdout
```

## Dependencies

- Phases 1-5 complete (existing flows, label-manager, post-ship-runner)
- `gh` CLI for reading issue comments (comment-guard)
- No new npm dependencies

## Estimated Effort

~3-4 hours (5 new files ~600 LOC, 2 modified files ~30 LOC changes)

## Cook Command

```
/ck:cook --auto @plans/260401-2054-phase-6-safety-reliability/plan.md
```
