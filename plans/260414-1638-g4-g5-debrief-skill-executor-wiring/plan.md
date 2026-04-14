---
title: "G4+G5 — Debrief Skill + Executor Wiring"
date: 2026-04-14
status: pending
priority: high
blockedBy: []
blocks: []
---

# Plan: G4+G5 — Debrief Skill + Builder Executor Wiring

**Goal**: Create the `debrief` skill/template and wire it as a post-cook step in `src/commands/build/epic-executor.ts`. After implementation, write a debrief trace comparing spec.md, plan.md, and cook result.

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-debrief-skill.md](phase-01-debrief-skill.md) | pending |
| 02 | [phase-02-executor-wiring.md](phase-02-executor-wiring.md) | pending |

## Key Files

| Action | File |
|--------|------|
| Create | `.claude/skills/debrief/SKILL.md` |
| Modify | `src/commands/build/epic-executor.ts` |

## Scope

- **In**: debrief SKILL.md, `debrief` step in `Step` union type + `STEP_TO_PHASE`, debrief call in `executeFromRoadmap()` after commit/knowledge-extraction, best-effort spec.md/plan.md lookup, debrief artifact written to `plans/reports/`
- **Out**: watcher integration (`post-ship-runner.ts`), debrief CLI command, vault mirroring of debrief, G6/G7 completion policy, spec-artifact-writer changes

## Dependencies

- `.claude/skills/debrief/SKILL.md` must exist before executor wiring is useful (phase-01 first)
- `epic-executor.ts` already has: `Step` type, `STEP_TO_PHASE`, `runStep()`, `spawnClaude()` — extend, don't replace

## Design Rules

- Debrief is best-effort: never blocks the pipeline (`try/catch + swallow`)
- Debrief artifact path: `plans/reports/debrief-{YYMMDD}-{HHMM}-{taskSlug}.md`
- Compare: task description (issue.title) vs cook stdout snippet + active plan dir spec.md/plan.md
- Active plan dir: find most recently modified dir under `plans/` (best-effort heuristic)
- KISS: no new abstraction modules — inline the lookup in epic-executor.ts under 30 lines
