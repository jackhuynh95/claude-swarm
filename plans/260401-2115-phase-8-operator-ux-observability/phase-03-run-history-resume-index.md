---
phase: 3
status: complete
priority: medium
effort: medium
---

# Phase 3 — Run History & Resume Index

## Overview

Extend status command with `--history` and `--resume` flags. History shows all recorded runs. Resume lists tasks that failed/timed-out and can be retried.

## Architecture

```
claude-swarm status --history          → all runs, newest first, paginated
claude-swarm status --history --issue 42  → filter by issue
claude-swarm status --history --date 2026-04-01  → filter by date
claude-swarm status --resume           → list resumable tasks with re-run hint
```

### Resume Output

```
▸ Resumable Tasks (2)
  run-39-1711929600000  #39  error       "Fix timeout"     exit: test phase failed
  run-35-1711926000000  #35  timeout     "Add caching"     exit: 10m timeout

  Resume: claude-swarm watch --resume <task-id>
```

## Related Code Files

**Read:**
- `src/commands/status/task-registry.ts` — getResumableTasks, listTasks

**Modify:**
- `src/commands/status/status-command.ts` — add --history and --resume subcommands

## Implementation Steps

1. Add `--history` option to status command:
   - List all tasks from TaskRegistry, newest first
   - Support `--issue <num>` filter
   - Support `--date <YYYY-MM-DD>` filter
   - Show: id, issue#, flow, status, duration, cost, exit reason
   - Limit to 25 per page (no pagination needed for v1 — just cap output)

2. Add `--resume` option:
   - Call `taskRegistry.getResumableTasks()`
   - Show task ID, issue, exit reason, exit message
   - Print hint: `claude-swarm watch --resume <task-id>` (future feature wire-up)

3. Add `resumable` flag logic in TaskRegistry.completeTask:
   - `error`, `timeout`, `needs_refix` → resumable = true
   - `completed`, `budget_exceeded` → resumable = false

## Success Criteria

- [x] `--history` lists all runs with filters
- [x] `--resume` lists resumable tasks
- [x] Resume hint printed for operator action
