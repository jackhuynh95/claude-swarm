---
title: "grill-me command + skill (B1)"
date: 2026-04-14
status: in-progress
priority: high
blockedBy: []
blocks: [260414-1630-spec-artifact-writer, 260414-1635-g3-builder-grill-me-integration]
---

# Plan: grill-me Command + Skill (B1)

**Goal**: Add `claude-swarm grill-me <topic>` public CLI command backed by a repo-local `grill-me` skill. The skill runs a spec-interview, writes `plans/<plan-dir>/spec.md`, and hands off to `/ck:plan`. Old guides and in-progress topics are untouched.

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-grill-me-skill.md](phase-01-grill-me-skill.md) | blocked |
| 02 | [phase-02-cli-command.md](phase-02-cli-command.md) | complete |
| 03 | [phase-03-index-wiring.md](phase-03-index-wiring.md) | complete |

## Key Files

| Action | File |
|--------|------|
| Create | `.claude/skills/grill-me/SKILL.md` |
| Create | `src/cli/grill-me.ts` |
| Modify | `src/index.ts` |

## Scope

- **In**: grill-me skill, CLI command, `src/index.ts` wiring, spec.md output format
- **Out**: debrief skill, builder integration (roadmap-generator.ts), watcher changes, docs updates (B2–B5)

## Compatibility

Do not touch existing skills, generated guides, or in-progress topic docs.
