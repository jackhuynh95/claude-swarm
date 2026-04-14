---
title: "G3 — Builder Grill-Me Integration"
date: 2026-04-14
status: pending
priority: high
blockedBy: [260414-1615-grill-me-command-skill]
blocks: []
---

# Plan: G3 — Builder Grill-Me Integration

**Goal**: Replace `ck:brainstorm` with `grill-me` as the default pre-plan step in all builder/manual roadmap generation entrypoints. If grill-me resolved scope, use `ck:plan --fast` on sonnet. Watcher unchanged.

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-roadmap-generator.md](phase-01-roadmap-generator.md) | pending |
| 02 | [phase-02-generate-doc.md](phase-02-generate-doc.md) | pending |
| 03 | [phase-03-from-scratch-pipeline.md](phase-03-from-scratch-pipeline.md) | pending |

## Key Files

| Action | File |
|--------|------|
| Modify | `src/commands/build/roadmap-generator.ts` |
| Modify | `src/commands/build/generate-doc.ts` |
| Modify | `src/commands/build/from-scratch-pipeline.ts` |

## Scope

- **In**: Replace brainstorm with grill-me in builder pipelines; add `--fast` sonnet path post grill-me; `skipGrillMe` escape hatch
- **Out**: Watcher changes, debrief integration, spec-artifact-writer module, docs/CLI updates

## Compatibility

- Existing generated guides (`docs/implement-roadmap-*.md`) are untouched
- `skipGrillMe: true` option preserves old behavior for callers with already-grilled topics
- No changes to watcher or epic-executor

## Blocked By

`260414-1615-grill-me-command-skill` phase-01 (grill-me SKILL.md) must exist so the `/grill-me` slash command is recognized when spawned via Claude subprocess.
