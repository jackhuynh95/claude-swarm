---
phase: 3
title: Wire --hard Flag into build-command.ts
status: done
priority: medium
effort: low
---

# Phase 3: Wire --hard Flag into build-command.ts

**Goal**: Add `--hard` flag to `build run` command. Route to hard pipeline in epic-executor.

## Current State

`build-command.ts` exposes `run` subcommand with flags: `--epic`, `--all`, `--from`, `--auto`, `--budget`, `--permission-mode`, `--timeout`, `--dry-run`.

No `--hard` flag exists.

## Target State

```bash
# Standard mode (default)
claude-swarm build run --epic 1 --auto --budget 5

# Hard mode — adds /ck:plan red-team + /ck:predict per issue
claude-swarm build run --epic 1 --auto --budget 10 --hard
```

## Implementation Steps

1. Add `--hard` option to `run` command in `build-command.ts`
2. Pass `hard: opts.hard` to `executeEpic()` / `executeAllEpics()` options
3. Compile check: `npx tsc --noEmit`

## Code Change

```typescript
buildCommand
  .command('run')
  .option('--epic <n>', 'Run specific epic', parseInt)
  .option('--all', 'Run all epics')
  .option('--from <n>', 'Resume from epic N', parseInt)
  .option('--hard', 'Deep analysis: plan red-team + predict per issue')  // NEW
  .option('--auto', 'Auto mode')
  .option('--budget <n>', 'Max USD per call', parseFloat)
  .option('--permission-mode <mode>', 'auto or skip')
  .option('--timeout <s>', 'Timeout per step in seconds', parseInt)
  .option('--dry-run', 'Show what would run')
  .action(async (opts) => {
    await executeEpic(opts.epic, {
      auto: opts.auto,
      hard: opts.hard,        // NEW
      budget: opts.budget,
      permissionMode: opts.permissionMode,
      timeout: opts.timeout,
      dryRun: opts.dryRun,
    });
  });
```

## Related Code Files

- **Modify**: `src/commands/build/build-command.ts`

## Task List

- [x] 1. Add `--hard` option to `build run` command definition
- [x] 2. Pass `hard` flag through to executor options
- [x] 3. Compile check: `npx tsc --noEmit`

## Success Criteria

- [x] `build run --hard` triggers hard pipeline (plan --hard → red-team → cook → test → predict → ship)
- [x] `build run` (no --hard) triggers standard pipeline (plan --fast → cook → test → ship)
- [x] `npx tsc --noEmit` passes
