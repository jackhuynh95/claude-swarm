---
status: complete
created: 2026-04-01
mode: fast
blockedBy: []
blocks: []
---

# Phase 5 — Standalone CLI Tools

**Goal**: Port standalone tools that work without the watcher daemon.

## Overview

Add 4 standalone commands to `claude-swarm` CLI:
- `claude-swarm read` — extract tasks from Slack via /slack-read skill
- `claude-swarm brainstorm` — brainstorm ideas and pipe to GitHub issues
- `claude-swarm report` — standalone Slack reporting (port from post-ship)
- Report-issue standalone mode folded into `report` command

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Slack Reader CLI | [phase-01-slack-reader.md](phase-01-slack-reader.md) | Done |
| 2 | Brainstormer CLI | [phase-02-brainstormer.md](phase-02-brainstormer.md) | Done |
| 3 | CLI Entry Points & Report | [phase-03-cli-entry-points.md](phase-03-cli-entry-points.md) | Done |

## Architecture

```
src/
├── cli/                          ← NEW directory
│   ├── slack-reader.ts           ← standalone /slack-read wrapper
│   ├── brainstormer.ts           ← /brainstorm → gh issue pipeline
│   └── report-issue.ts           ← standalone /slack-report
├── index.ts                      ← add 3 new subcommands
└── commands/watch/phases/
    ├── claude-invoker.ts         ← reused by all CLI tools
    └── slack-reporter.ts         ← report-issue.ts reuses buildSlackPrompt pattern
```

All standalone tools share the same pattern:
1. Parse CLI args (commander)
2. Build prompt string
3. Call `invokeClaudePhase()` with appropriate phase config
4. Format/display output or pipe to GitHub

## Dependencies

- Reuses `invokeClaudePhase()` from `claude-invoker.ts`
- Reuses `getPhaseConfig()` from `model-router.ts`
- GitHub issue creation uses `@octokit/rest` (already a dep)
- No new dependencies needed

## Cook Command

```
/ck:cook --auto @plans/260401-2046-phase-5-standalone-cli-tools/plan.md
```
