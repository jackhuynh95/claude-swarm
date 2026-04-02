---
status: complete
priority: high
blockedBy: []
blocks: []
---

# Phase 0: Roadmap Generator & From-Scratch Pipeline

**Date**: 2026-04-02
**Goal**: Implement `claude-swarm build generate` and `claude-swarm build from-scratch` commands
**Location**: `src/commands/build/`

## Overview

Create the roadmap generator that takes a human idea/spec and uses Claude (opus, high effort) to brainstorm a structured roadmap markdown, plus the `from-scratch` pipeline that chains generate → init → run.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Roadmap Generator | `roadmap-generator.ts` | Complete |
| 2 | From-Scratch Pipeline | `from-scratch-pipeline.ts` | Complete |
| 3 | CLI Wiring (build command) | `build-command.ts` + `src/index.ts` | Complete |

## Key Decisions

- Reuse `invokeClaude` pattern from `claude-invoker.ts` for spawning Claude subprocess
- Use `commander` subcommand pattern matching `watch-command.ts`
- Output format follows existing `docs/implement-roadmap.md` structure (headings + tables + status columns)
- Slug generation: kebab-case from topic string, used for `docs/implement-roadmap-{slug}.md`

## Dependencies

- `commander` (already installed)
- `chalk` (already installed)
- `ora` (already installed)
- Claude CLI installed on system

## Files to Create

- `src/commands/build/build-command.ts` — CLI entry + subcommand router
- `src/commands/build/roadmap-generator.ts` — generate subcommand logic
- `src/commands/build/from-scratch-pipeline.ts` — from-scratch subcommand logic

## Files to Modify

- `src/index.ts` — add `buildCommand` import + `program.addCommand(buildCommand)`
