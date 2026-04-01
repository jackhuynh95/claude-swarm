---
phase: 1
status: complete
priority: high
effort: medium
---

# Phase 1 — Task Metadata Layer

## Overview

Create `TaskRegistry` — a JSON-backed store that tracks every issue processing run with rich metadata: unique ID, role/flow, timestamps, status, exit reason, and artifact links. This is the foundation all other Phase 8 features read from.

## Key Insights

- Existing stores (budget-guard, cost-tracker, conversation-history) each track one dimension. TaskRegistry unifies the "what happened" view.
- Must be backward-compatible: existing stores keep working, TaskRegistry is additive.
- Write-path: called from watch-command after each flow completes. Read-path: status command.

## Architecture

```
TaskRegistry (.ck-tasks.json)
├── tasks: Record<taskId, TaskMetadata>
│   ├── id: string (uuid-like: "run-{issueNum}-{timestamp}")
│   ├── issueNumber: number
│   ├── issueTitle: string
│   ├── role: FlowType ("debug-flow" | "ship-flow")
│   ├── issueType: IssueType
│   ├── state: IssueState
│   ├── startedAt: string (ISO)
│   ├── endedAt?: string (ISO)
│   ├── exitReason?: "completed" | "error" | "timeout" | "budget_exceeded" | "needs_refix"
│   ├── exitMessage?: string
│   ├── phases: PhaseResult[]
│   ├── artifacts: string[] (PR URLs, plan paths, test result paths)
│   ├── costUsd?: number
│   └── resumable: boolean
└── version: 1
```

## Related Code Files

**Read for context:**
- `src/commands/watch/types.ts` — ClassifiedIssue, PhaseResult, IssueState
- `src/commands/watch/phases/budget-guard.ts` — pattern for JSON persistence with atomic writes
- `src/commands/watch/phases/conversation-history.ts` — pattern for per-issue state

**Create:**
- `src/commands/status/task-registry.ts`

**Modify:**
- `src/commands/watch/types.ts` — add TaskMetadata interface + ExitReason type

## Implementation Steps

1. Add to `types.ts`:
   ```ts
   export type ExitReason = 'completed' | 'error' | 'timeout' | 'budget_exceeded' | 'needs_refix';

   export interface TaskMetadata {
     id: string;
     issueNumber: number;
     issueTitle: string;
     role: FlowType;
     issueType: IssueType;
     state: IssueState;
     startedAt: string;
     endedAt?: string;
     exitReason?: ExitReason;
     exitMessage?: string;
     phases: PhaseResult[];
     artifacts: string[];
     costUsd?: number;
     resumable: boolean;
   }
   ```

2. Create `src/commands/status/task-registry.ts`:
   - `TaskRegistry` class with JSON file backing (same atomic write pattern as BudgetGuard)
   - Methods: `startTask(classified)`, `recordPhase(taskId, result)`, `completeTask(taskId, exitReason, message?)`, `getTask(taskId)`, `getActiveTask(issueNum)`, `listTasks(filter?)`, `getResumableTasks()`
   - `startTask` generates ID as `run-{issueNum}-{Date.now()}`
   - `completeTask` sets endedAt, exitReason, resumable flag (true if error/timeout/needs_refix)
   - Filter support: by state, by issueNumber, by date range
   - Default path: `.ck-tasks.json`

3. Ensure `mkdir -p` for status dir before first write (handle fresh clone)

## Success Criteria

- [x] TaskMetadata type added to types.ts
- [x] TaskRegistry reads/writes .ck-tasks.json with atomic writes
- [x] startTask, recordPhase, completeTask, getTask, listTasks, getResumableTasks all work
- [x] File survives process restarts (JSON persistence)
- [x] Never throws — best-effort like run-recorder

## Risk Assessment

- **File corruption on crash**: Mitigated by atomic write (write tmp → rename)
- **Unbounded growth**: Add optional `maxTasks` pruning (keep last 500)
