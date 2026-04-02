---
status: completed
priority: high
blockedBy: [260402-1658-build-phase1-roadmap-parser]
blocks: []
---

# Phase 3: Epic Executor

**Date**: 2026-04-02
**Goal**: Plan, cook, test, ship each issue in an epic via Claude CLI subprocesses
**Location**: `src/commands/build/epic-executor.ts`

## Overview

Create the core execution engine that iterates over GitHub issues within an epic and runs a 4-step pipeline per issue: plan -> cook -> test -> commit. Closes issues on success, updates epic checklist, supports resume, budget control, model routing, timeouts, and permission modes.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Core executor + subprocess spawner | `epic-executor.ts` | Completed |
| 2 | Wire into build-command.ts | `build-command.ts` | Completed |

## Dependencies

- `commander` (existing)
- `chalk` (existing)
- `ora` (existing)
- `gh` CLI (system — for issue queries/close/edit)
- `claude` CLI (system — for plan/cook/test/commit)
- `roadmap-parser.ts` types (existing — `Epic`, `Issue`)

## Files to Create

- `src/commands/build/epic-executor.ts` — Core epic execution engine

## Files to Modify

- `src/commands/build/build-command.ts` — Wire `run`, `plan`, `cook` subcommands to executor

## Architecture

```
epic-executor.ts
├── Types
│   ├── ExecutorOptions { epic, auto, budget, permissionMode, timeout, dryRun }
│   └── StepResult { success, stdout, stderr, duration }
├── GitHub Helpers (gh CLI wrappers)
│   ├── fetchEpicIssues(epicNumber) → issue[] (gh issue list --label "epic-N")
│   ├── isIssueClosed(issueNumber) → boolean
│   ├── closeIssue(issueNumber) → void
│   └── updateEpicChecklist(epicNumber, childNumber) → void
├── Claude Subprocess Runner
│   ├── spawnClaude(prompt, opts) → StepResult
│   │   - model routing via opts.model
│   │   - --max-budget-usd per call
│   │   - --permission-mode or --dangerously-skip-permissions
│   │   - timeout: SIGTERM → 5s → SIGKILL
│   └── Model routing map: plan=opus, cook=sonnet, test=sonnet, commit=haiku
├── Pipeline Steps
│   ├── planIssue(issue) → spawnClaude("/ck:plan --fast ...")
│   ├── cookIssue(issue) → spawnClaude("/ck:cook --auto ...")
│   ├── testIssue(issue) → spawnClaude("/test ...")
│   └── commitIssue(issue) → spawnClaude("/ck:git cm ...")
└── Public API
    ├── executeEpic(epicNumber, options) → void
    └── executeAllEpics(options) → void
```

## Implementation Steps

### Step 1: Types and constants

```typescript
// Model routing: step → claude model flag
const MODEL_MAP = {
  plan: 'claude-opus-4-5',
  cook: 'claude-sonnet-4-5',
  test: 'claude-sonnet-4-5',
  commit: 'claude-haiku-4-5-20251001',
} as const;

type Step = keyof typeof MODEL_MAP;

interface ExecutorOptions {
  auto?: boolean;
  budget?: number;         // --max-budget-usd per claude call
  permissionMode?: 'auto' | 'skip'; // 'auto' or 'skip' (dangerously-skip-permissions)
  timeout?: number;        // seconds per subprocess (default 600)
  dryRun?: boolean;
  fromIssue?: number;      // resume from this issue number
}

interface StepResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}
```

### Step 2: GitHub helpers via `gh` CLI

Use `execSync` from `node:child_process` for synchronous `gh` commands. These are fast API calls, no need for async.

- **fetchEpicIssues**: `gh issue list --label "epic" --state open --json number,title,state,labels -L 100` then filter by epic number reference in body or label.
  - Better approach: the epic issue body contains a task list `- [ ] #123 Task title`. Parse the epic body to get child issue numbers.
  - `gh issue view <epicNumber> --json body` → parse `- [x] #N` and `- [ ] #N` lines.
- **isIssueClosed**: `gh issue view <N> --json state` → check `state === "CLOSED"`
- **closeIssue**: `gh issue close <N>`
- **updateEpicChecklist**: `gh issue view <epicNumber> --json body` → replace `- [ ] #N` with `- [x] #N` → `gh issue edit <epicNumber> --body "..."`

### Step 3: Claude subprocess spawner

Reuse the pattern from `roadmap-generator.ts` (`spawn` + SIGTERM/SIGKILL timeout):

```typescript
function spawnClaude(prompt: string, opts: {
  model: string;
  budget?: number;
  permissionMode?: 'auto' | 'skip';
  timeout?: number;
}): Promise<StepResult> {
  const args = ['-p', prompt, '--model', opts.model, '--output-format', 'text'];
  if (opts.budget) args.push('--max-budget-usd', String(opts.budget));
  if (opts.permissionMode === 'skip') {
    args.push('--dangerously-skip-permissions');
  } else if (opts.permissionMode === 'auto') {
    args.push('--permission-mode', 'auto');
  }
  // spawn + timeout logic identical to roadmap-generator.ts
}
```

### Step 4: Pipeline steps

Each step constructs a prompt string and calls `spawnClaude` with the appropriate model:

- **planIssue**: `"/ck:plan --fast Implement #{issue.number}: {issue.title}"` → model: opus
- **cookIssue**: `"/ck:cook --auto #{issue.number}: {issue.title}"` → model: sonnet
- **testIssue**: `"/test"` → model: sonnet
- **commitIssue**: `"/ck:git cm"` → model: haiku

If any step fails (non-zero exit), log error and skip to next issue (don't close).

### Step 5: executeEpic main loop

```typescript
async function executeEpic(epicNumber: number, opts: ExecutorOptions) {
  // 1. Fetch child issues from epic body checklist
  const children = fetchEpicChildren(epicNumber);

  for (const child of children) {
    // 2. Resume: skip already-closed issues
    if (isIssueClosed(child.number)) {
      console.log(chalk.dim(`  ✓ #${child.number} already closed — skipping`));
      continue;
    }

    // 3. Run pipeline: plan → cook → test → commit
    const steps: { name: Step; prompt: string }[] = [
      { name: 'plan', prompt: `/ck:plan --fast Implement #${child.number}: ${child.title}` },
      { name: 'cook', prompt: `/ck:cook --auto #${child.number}: ${child.title}` },
      { name: 'test', prompt: `/test` },
      { name: 'commit', prompt: `/ck:git cm` },
    ];

    let allPassed = true;
    for (const step of steps) {
      const result = await spawnClaude(step.prompt, {
        model: MODEL_MAP[step.name],
        budget: opts.budget,
        permissionMode: opts.permissionMode,
        timeout: opts.timeout ?? 600,
      });
      if (!result.success) {
        console.error(chalk.red(`  ✗ ${step.name} failed for #${child.number}`));
        allPassed = false;
        break;
      }
    }

    // 4. Close issue + update epic checklist on success
    if (allPassed) {
      closeIssue(child.number);
      updateEpicChecklist(epicNumber, child.number);
      console.log(chalk.green(`  ✓ #${child.number} completed and closed`));
    }
  }
}
```

### Step 6: Wire into build-command.ts

Update the existing `run` stub and add `plan`/`cook` subcommands:

```typescript
buildCommand
  .command('run')
  .option('--epic <n>', 'Run specific epic', parseInt)
  .option('--all', 'Run all epics')
  .option('--from <n>', 'Resume from epic N', parseInt)
  .option('--auto', 'Auto mode')
  .option('--budget <n>', 'Max USD per call', parseFloat)
  .option('--permission-mode <mode>', 'auto or skip')
  .option('--timeout <s>', 'Timeout per step in seconds', parseInt)
  .option('--dry-run', 'Show what would run')
  .action(async (opts) => { /* call executeEpic or executeAllEpics */ });

buildCommand
  .command('plan')
  .option('--epic <n>', 'Plan issues in epic N', parseInt)
  .action(async (opts) => { /* call planEpic */ });

buildCommand
  .command('cook')
  .option('--epic <n>', 'Cook issues in epic N', parseInt)
  .option('--auto', 'Auto mode')
  .action(async (opts) => { /* call cookEpic */ });
```

## Task List

- [x] 1. Create `epic-executor.ts` with types/constants + MODEL_MAP
- [x] 2. Implement `spawnClaude()` with model routing, budget, permission-mode, timeout
- [x] 3. Implement GitHub helpers: `fetchEpicChildren`, `isIssueClosed`, `closeIssue`, `updateEpicChecklist`
- [x] 4. Implement pipeline steps: `planIssue`, `cookIssue`, `testIssue`, `commitIssue`
- [x] 5. Implement `executeEpic()` main loop with resume logic
- [x] 6. Implement `executeAllEpics()` for `--all` and `--from` flags
- [x] 7. Wire into `build-command.ts`: update `run`, add `plan`, `cook` subcommands
- [x] 8. Compile check: `npx tsc --noEmit`

## Success Criteria

- [x] `spawnClaude` routes to correct model per step (opus/sonnet/haiku)
- [x] `--max-budget-usd` flag passed through to each claude call
- [x] `--permission-mode auto` or `--dangerously-skip-permissions` applied
- [x] Timeout kills subprocess: SIGTERM → 5s → SIGKILL
- [x] Already-closed issues are skipped (resume support)
- [x] `gh issue close` called on success
- [x] Epic body checklist updated `- [ ] #N` → `- [x] #N`
- [x] `npx tsc --noEmit` passes
- [x] `build run --epic 1 --auto --budget 5` works end-to-end

## Risk Assessment

- **Medium**: `gh` CLI output format may vary across versions
  - Mitigation: Use `--json` flag for structured output, parse JSON not text
- **Low**: Claude subprocess may hang beyond timeout
  - Mitigation: SIGTERM → 5s → SIGKILL pattern (proven in roadmap-generator.ts)
- **Low**: Epic body format may not have `- [ ] #N` checklist
  - Mitigation: Fall back to `gh issue list` with label filtering

## Cook Command

```bash
claude -p "/ck:cook --auto @/Users/jackhuynh/Documents/GitHub/claude-swarm/plans/260402-1711-build-phase3-epic-executor/plan.md"
```
