---
title: "Spec Artifact Writer (G2)"
date: 2026-04-14
status: in-progress
priority: high
blockedBy: [260414-1615-grill-me-command-skill]
blocks: []
---

# Plan: Spec Artifact Writer (G2)

**Goal**: TypeScript module that writes `plans/<plan-dir>/spec.md` (execution truth) and mirrors a lightweight summary into `obsidian-vault/Review/Runs/` (memory/reuse layer) after grill-me execution.

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-spec-writer-module.md](phase-01-spec-writer-module.md) | pending |
| 02 | [phase-02-vault-mirror.md](phase-02-vault-mirror.md) | pending |

## Key Files

| Action | File |
|--------|------|
| Create | `src/commands/build/spec-artifact-writer.ts` |
| Modify | `src/cli/grill-me.ts` |

## Scope

- **In**: `SpecArtifact` type, `writeSpecArtifact()`, `readSpecArtifact()`, `mirrorSpecToVault()`, wire into grill-me CLI post-execution
- **Out**: debrief skill, builder/watcher pipeline integration, changing spec.md format defined in phase-01

## Design Rules

- `plans/` = execution truth — spec.md lives here
- `obsidian-vault/` = memory/reuse — lightweight mirror goes here after execution
- Vault mirror is best-effort (never blocks or throws)
- Reuse `buildFrontmatter` from `src/commands/sync/frontmatter-parser.ts`

## Blocked By

Phase-01 of `260414-1615-grill-me-command-skill` must exist (provides SKILL.md that writes spec.md content via Claude). However, this plan's TypeScript layer is independent enough to implement in parallel — it just needs the spec.md format to be stable, which is already defined.
