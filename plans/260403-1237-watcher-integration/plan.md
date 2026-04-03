---
title: VividKit Watcher Integration (Phase 7)
status: done
priority: high
created: 2026-04-03
mode: fast
blockedBy: [260403-1209-vividkit-test-flow, 260403-1217-vividkit-security-flow, 260403-1224-vividkit-verify-ship-gate]
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 7)
---

# VividKit Watcher Integration

Wire all new VividKit flows into the watch daemon poll cycle. Add green/red test pipeline to post-ship, add `/ck:watzup` at poll start, `/ck:retro` at nightly end, and extend model-router with new phase configs.

## Current State Analysis

Most Phase 7 tasks are **partially or fully done** from earlier phases:

| Roadmap Task | Current State | Action Needed |
|---|---|---|
| issue-router detects CI/logs/UI/security | **Done** — RouteFlags has `ciFailure`, `hasLogs`, `designReview`, `securityScan` | None |
| test-flow.ts exists | **Done** — complete module at `phases/test-flow.ts` | Wire into post-ship |
| security-flow.ts exists | **Done** — complete module at `phases/security-flow.ts`, already imported in post-ship | Reorder: run after green pass |
| model-router has test/security configs | **Done** — has `scenario`, `ui_test`, `security`, `security_review`, `security_stride` | Add `retro` + `watzup` |
| `/ck:retro` at nightly end | **Missing** | Add to watch-command |
| `/ck:watzup` at poll start | **Missing** | Add to watch-command |

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-model-router-watzup-retro.md) | `types.ts`, `model-router.ts` | Done |
| [Phase 2](phase-02-post-ship-green-red-pipeline.md) | `post-ship-runner.ts` | Done |
| [Phase 3](phase-03-watch-command-watzup-retro.md) | `watch-command.ts` | Done |
