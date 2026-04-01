---
status: complete
created: 2026-04-01
completed: 2026-04-01
phase: 8
blockedBy: []
blocks: []
---

# Phase 8 — Operator UX & Observability

**Goal**: Answer "what's running, what failed, what did it cost?" via CLI.

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 1 | Task metadata layer | Complete | High |
| 2 | Status command | Complete | High |
| 3 | Run history & resume index | Complete | Medium |
| 4 | Capability matrix | Complete | Medium |
| 5 | Searchable plan/run/review index | Complete | Medium |

## Architecture

```
Existing data stores (read-only for status):
  .ck-budget.json   ← BudgetGuard (per-issue invocations/tokens)
  .ck-costs.json    ← CostTracker (daily cost buckets)
  .ck-history.json  ← ConversationHistory (per-issue phase outputs)
  obsidian-vault/Review/Runs/  ← RunRecorder (markdown run summaries)

New data store:
  .ck-tasks.json    ← TaskRegistry (enriched metadata: id, role, timestamps, status, exit reason, artifacts)

New CLI commands:
  claude-swarm status          ← active tasks, queue, recent results, cost
  claude-swarm status --history ← full run history
  claude-swarm status --resume  ← resumable failed/timed-out tasks
  claude-swarm status --matrix  ← capability matrix
  claude-swarm status --search <query> ← search plans/runs/reviews
```

## Key Decisions

- **Single `status` command with subflags** vs separate commands → subflags (fewer commander registrations, cohesive UX)
- **TaskRegistry as new JSON store** vs extending existing stores → new store (separation of concerns; existing stores serve their specific purposes)
- **Capability matrix as static JSON** vs dynamic detection → static JSON checked into repo, rendered by status command

## Files

### New files to create
- `src/commands/status/task-registry.ts` — TaskRegistry class, CRUD for task metadata
- `src/commands/status/status-command.ts` — CLI command, renders output with chalk
- `src/commands/status/run-history.ts` — aggregates history from .ck-history.json + .ck-costs.json
- `src/commands/status/capability-matrix.ts` — static matrix data + renderer
- `src/commands/status/search-index.ts` — search across plans/runs/reviews

### Files to modify
- `src/index.ts` — register statusCommand
- `src/commands/watch/types.ts` — add TaskMetadata interface

## Dependencies
- chalk (already in deps) — colored terminal output
- commander (already in deps) — CLI
- No new dependencies needed
