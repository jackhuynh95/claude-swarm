---
title: VividKit Builder Upgrade
status: complete
priority: high
created: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 6)
---

# VividKit Builder Upgrade

Upgrade `epic-executor.ts` and `build-command.ts` to use VividKit commands. Replace the 4-step pipeline (plan → cook → test → commit) with VividKit-powered flows: `/ck:brainstorm` + `/ck:plan --hard` for generation, `/ck:ship --official` for verify+PR with `createPullRequest()` fallback, `/ck:plan red-team` + `/ck:predict` for `--hard` mode, and `/ck:scenario` for test case generation.

## Current State

`epic-executor.ts` runs a 4-step pipeline per issue:
1. `planIssue()` → `/ck:plan --fast ...` (model: opus)
2. `cookIssue()` → `/ck:cook --auto ...` (model: sonnet)
3. `testIssue()` → `/test` (model: sonnet)
4. `commitIssue()` → `/ck:git cm` (model: haiku)

On success: `closeIssue()` + `updateEpicChecklist()`. Resume support via `isIssueClosed()` skip.

`build-command.ts` exposes: `run`, `plan`, `cook` subcommands with `--epic`, `--all`, `--from`, `--auto`, `--budget`, `--permission-mode`, `--timeout`, `--dry-run` flags.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Upgrade epic-executor pipeline + add --hard mode | [phase-01](phase-01-upgrade-pipeline.md) | Done |
| 2 | Upgrade build generate + scenario generation | [phase-02](phase-02-upgrade-generate.md) | Done |
| 3 | Wire --hard flag into build-command.ts | [phase-03](phase-03-wire-hard-flag.md) | Done |

## Dependencies

- `branch-manager.ts` `createPullRequest()` at `src/commands/watch/phases/branch-manager.ts:90` (fallback — DO NOT modify)
- `model-router.ts` `getPhaseConfig()` at `src/commands/watch/phases/model-router.ts:34`
- `spawnClaude()` already exists in epic-executor.ts (reuse pattern)

## Files to Modify

- `src/commands/build/epic-executor.ts` — Upgrade pipeline, add ship+fallback, add --hard steps
- `src/commands/build/build-command.ts` — Add --hard flag, wire new options

## Files to Read (context only)

- `src/commands/watch/phases/branch-manager.ts` — createPullRequest() signature for fallback import
- `src/commands/watch/phases/model-router.ts` — getPhaseConfig() for model routing

## Cook Command

```bash
claude -p "/ck:cook --auto @/Users/jackhuynh/Documents/GitHub/claude-swarm/plans/260403-1231-vividkit-builder-upgrade/plan.md"
```
