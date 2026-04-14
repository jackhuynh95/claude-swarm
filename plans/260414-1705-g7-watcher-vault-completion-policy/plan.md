---
title: "G7 — Watcher Vault Completion Policy"
date: 2026-04-14
status: complete
priority: high
blockedBy: []
blocks: []
---

# Plan: G7 — Watcher Vault Completion Policy

**Goal**: Implement the vault-based completion rule: without `--vault` allow best-effort debrief only; with `--vault` require vault-backed trace for official completion. Update status messaging throughout.

**Soft dependency**: G5 plan (`260414-1701-g5-watcher-debrief-post-ship`) adds the debrief step (8.5) inside `executePostShip()`. Phase 02 of this plan (vault trace assertion) should be applied after G5 ships. Phase 01 (no-vault best-effort path + messaging) is independent.

**Do NOT**: migrate watcher clarify into grill-me (deferred). Touch build/epic-executor flows.

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-no-vault-best-effort-path.md](phase-01-no-vault-best-effort-path.md) | complete |
| 02 | [phase-02-vault-official-completion-gate.md](phase-02-vault-official-completion-gate.md) | complete |

## Key Files

| Action | File |
|--------|------|
| Modify | `src/commands/watch/watch-command.ts` |
| Modify | `src/commands/watch/phases/post-ship-runner.ts` |
| Modify | `src/commands/watch/types.ts` (if PostShipResult needs new field) |

## Scope

- **In**: no-vault best-effort debrief call, vault completion gate assertion, status messaging ("OFFICIAL COMPLETE" vs "BEST-EFFORT ONLY"), `PostShipResult.officialComplete` field
- **Out**: grill-me/clarify migration, builder/epic-executor changes, vault mirroring logic inside debrief skill, any new CLI commands

## Policy Summary

```
without --vault:
  run best-effort debrief (single invokeClaudePhase call)
  log: "[watch] BEST-EFFORT COMPLETE — vault trace required for official completion"
  issue treated as "done locally" but not "officially traceable"

with --vault:
  full executePostShip() runs (test → security → scout → predict → ship → design → slack → debrief → journal → llms → run-recorder → knowledge)
  vault trace written by journal + run-recorder
  log: "[watch] OFFICIAL COMPLETE — verdict=PASS"
```
