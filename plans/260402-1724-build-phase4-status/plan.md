---
status: complete
priority: high
blockedBy: [260402-1711-build-phase3-epic-executor]
blocks: []
---

# Phase 4: Build Status

**Date**: 2026-04-02
**Goal**: Show progress across milestone → epic → issue hierarchy via `gh` CLI
**Location**: `src/commands/build/build-status.ts`

## Overview

Create `build-status.ts` — a terminal dashboard that queries GitHub via `gh` CLI to display milestone progress, per-epic progress bars, and optional cost summary from `.ck-costs.json`.

## Dependencies

- `chalk` (existing) — colored output
- `gh` CLI (system) — milestone/issue queries
- `cost-tracker.ts` (existing) — `getDailySummary()`, `CostSummary` type

## Files to Create

- `src/commands/build/build-status.ts` — Status display module

## Files to Modify

- `src/commands/build/build-command.ts` — Wire `status` subcommand

## Architecture

```
build-status.ts
├── Types
│   ├── MilestoneInfo { title, openIssues, closedIssues, dueDate? }
│   ├── EpicStatus { number, title, children: ChildStatus[] }
│   └── ChildStatus { number, title, state: 'open' | 'closed' }
├── GitHub Queries (gh CLI via execSync)
│   ├── fetchMilestone(name) → MilestoneInfo
│   ├── fetchEpics(milestone?) → EpicStatus[]
│   └── fetchEpicChildren(epicNumber) → ChildStatus[]
├── Display Helpers
│   ├── progressBar(done, total, width=20) → string (e.g. "████████░░░░ 8/12")
│   ├── renderMilestoneHeader(info) → void (prints to stdout)
│   ├── renderEpicProgress(epics) → void (prints per-epic bars)
│   └── renderCostSummary(summary?) → void (prints cost if available)
└── Public API
    └── showBuildStatus(options?: { milestone?: string }) → Promise<void>
```

## Implementation Steps

### Step 1: Types

```typescript
interface MilestoneInfo {
  title: string;
  number: number;
  openIssues: number;
  closedIssues: number;
}

interface ChildStatus {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
}

interface EpicStatus {
  number: number;
  title: string;
  children: ChildStatus[];
}
```

### Step 2: GitHub queries via `gh` CLI

Use `execSync` (same pattern as epic-executor.ts):

- **fetchMilestones**: `gh api repos/{owner}/{repo}/milestones --jq '.[] | {title,number,open_issues,closed_issues}'`
  - If `--milestone` flag given, filter by title match
  - Otherwise show the most recent open milestone
- **fetchEpics**: `gh issue list --label "epic" --milestone <name> --state all --json number,title,state -L 100`
- **fetchEpicChildren**: Parse epic issue body for `- [x] #N` and `- [ ] #N` task list items, then `gh issue view <N> --json number,title,state` for each child.
  - Optimization: batch with `gh issue list --json number,title,state -L 200` then filter by known child numbers to avoid N+1 queries.

### Step 3: Display helpers

**Progress bar**:
```typescript
function progressBar(done: number, total: number, width = 20): string {
  if (total === 0) return chalk.dim('░'.repeat(width) + ' 0/0');
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  const pct = Math.round((done / total) * 100);
  const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `${bar} ${done}/${total} (${pct}%)`;
}
```

**Milestone header**: Print title, overall open/closed counts, overall progress bar.

**Epic rows**: For each epic, show `Epic #N: Title` then progress bar of closed/total children.

**Cost summary**: Try importing `getDailySummary` from cost-tracker. If `.ck-costs.json` exists, show today's total USD, run count, top issues. If not, skip silently.

### Step 4: Main `showBuildStatus` function

```typescript
export async function showBuildStatus(options?: { milestone?: string }): Promise<void> {
  // 1. Detect repo owner/name from gh
  // 2. Fetch milestone(s)
  // 3. For each milestone: fetch epics → fetch children per epic
  // 4. Render milestone header with overall progress
  // 5. Render per-epic progress bars
  // 6. Render cost summary if available
}
```

### Step 5: Wire into build-command.ts

Add `status` subcommand:
```typescript
buildCommand
  .command('status')
  .description('Show build progress across milestone/epic/issue hierarchy')
  .option('--milestone <name>', 'Filter by milestone name')
  .action(async (opts) => {
    await showBuildStatus(opts);
  });
```

## Expected Output

```
╔══════════════════════════════════════════════════╗
║  Milestone: v2.1 — Add Payment Gateway          ║
║  ████████████░░░░░░░░ 12/20 (60%)               ║
╚══════════════════════════════════════════════════╝

  Epic #1: Database Schema
    ██████████████████░░ 9/10 (90%)

  Epic #2: API Endpoints
    ████████░░░░░░░░░░░░ 2/5 (40%)

  Epic #3: Frontend Integration
    ██░░░░░░░░░░░░░░░░░░ 1/5 (20%)

💰 Cost (today): $2.45 across 8 runs
   Top: #42 ($0.89), #43 ($0.67), #44 ($0.45)
```

## Todo

- [x] Create `src/commands/build/build-status.ts` with types + gh queries
- [x] Implement `progressBar()` and render helpers
- [x] Implement `showBuildStatus()` main function
- [x] Wire `status` subcommand in `build-command.ts`
- [x] Handle edge cases: no milestone found, no epics, empty children

## Success Criteria

- `claude-swarm build status` shows milestone + epic progress bars
- `claude-swarm build status --milestone "v2.1"` filters by milestone
- Cost summary shows when `.ck-costs.json` exists, silently skipped otherwise
- Graceful handling of missing milestone/no epics/no children

## Risk Assessment

- **Low risk**: Read-only command, no mutations
- **gh API rate limits**: Uses `gh` CLI which handles auth; batch child queries to minimize calls
- **Cost tracker coupling**: Import is optional, fail silently if missing
