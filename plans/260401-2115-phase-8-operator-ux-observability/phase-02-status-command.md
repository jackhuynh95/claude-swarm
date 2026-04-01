---
phase: 2
status: complete
priority: high
effort: medium
---

# Phase 2 — Status Command

## Overview

Create `claude-swarm status` CLI command that reads TaskRegistry + existing stores to show a unified operator dashboard in the terminal.

## Key Insights

- Primary UX: operator opens terminal, runs `claude-swarm status`, sees what's happening at a glance
- Use chalk for colored output — green/red/yellow status indicators
- Keep output concise by default, verbose with flags

## Architecture

```
claude-swarm status              → dashboard (active + recent + cost)
claude-swarm status --active     → only active/in-progress tasks
claude-swarm status --recent N   → last N completed tasks (default 10)
claude-swarm status --cost       → today's cost summary
claude-swarm status --task <id>  → detailed single task view
```

### Default Dashboard Output

```
╭──────────────────────────────────────────────╮
│  claude-swarm status                         │
╰──────────────────────────────────────────────╯

▸ Active Tasks (2)
  #42  [ship-flow]  implementing  "Add user auth"       3m ago
  #51  [debug-flow] testing       "Fix login crash"     1m ago

▸ Queue (1)
  #55  [ship-flow]  awaiting_approval  "Refactor DB"

▸ Recent (3)
  #40  ✓ completed   ship-flow   "Add search"    12m   $0.42
  #39  ✗ error       debug-flow  "Fix timeout"    8m   $0.18
  #38  ✓ completed   ship-flow   "Update docs"    2m   $0.05

▸ Today: 6 runs · $1.23 estimated
```

## Related Code Files

**Read:**
- `src/index.ts` — CLI registration pattern
- `src/cli/slack-reader.ts` — existing CLI command pattern
- `src/commands/watch/phases/cost-tracker.ts` — getDailySummary

**Create:**
- `src/commands/status/status-command.ts`

**Modify:**
- `src/index.ts` — add statusCommand

## Implementation Steps

1. Create `src/commands/status/status-command.ts`:
   - Commander subcommand `status` with options: `--active`, `--recent <n>`, `--cost`, `--task <id>`
   - Import TaskRegistry, getDailySummary from cost-tracker
   - Default view: active tasks + last 5 completed + today's cost one-liner
   - `--task <id>`: show full task detail (all phases, durations, errors, artifacts)
   - Use chalk: green for completed, red for error, yellow for in-progress, dim for queue
   - Format durations as human-readable (2m, 1h 5m)

2. Register in `src/index.ts`:
   ```ts
   import { statusCommand } from './commands/status/status-command.js';
   program.addCommand(statusCommand);
   ```

3. Handle empty state gracefully — "No tasks recorded yet. Run `claude-swarm watch` to start."

## Success Criteria

- [x] `claude-swarm status` shows active, queued, recent tasks
- [x] `--task <id>` shows detailed single-task view
- [x] `--cost` shows daily cost summary
- [x] Empty state handled gracefully
- [x] Colored terminal output with chalk
