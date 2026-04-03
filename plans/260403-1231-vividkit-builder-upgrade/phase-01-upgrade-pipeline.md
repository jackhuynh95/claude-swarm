---
phase: 1
title: Upgrade Epic Executor Pipeline
status: pending
priority: high
effort: medium
---

# Phase 1: Upgrade Epic Executor Pipeline

**Goal**: Replace 4-step pipeline with VividKit commands. Add `/ck:ship --official` as verify+PR with `createPullRequest()` fallback. Add `--hard` mode with `/ck:plan red-team` + `/ck:predict`.

## Context

- [epic-executor.ts original plan](../260402-1711-build-phase3-epic-executor/plan.md)
- [VividKit roadmap Phase 6](../../docs/implement-roadmap-vividkit-commands.md)
- [Verify+Ship gate plan](../260403-1224-vividkit-verify-ship-gate/plan.md) — same pattern for `/ck:ship --official` + fallback

## Current Pipeline (per issue)

```
plan → cook → test → commit → closeIssue → updateChecklist
```

Steps use `spawnClaude()` with MODEL_MAP: `{ plan: opus, cook: sonnet, test: sonnet, commit: haiku }`

## Target Pipeline

### Standard mode (`build run`)

```
/ck:plan --fast → /ck:cook --auto → /ck:test → /ck:ship --official
  │                                                │
  │                                                ├── SUCCESS → closeIssue + updateChecklist
  │                                                └── FAIL → FALLBACK: createPullRequest()
  │                                                      ├── SUCCESS → closeIssue + updateChecklist
  │                                                      └── FAIL → log error, skip issue
```

### Hard mode (`build run --hard`)

```
/ck:plan --hard → /ck:plan red-team → /ck:cook --auto → /ck:test → /ck:predict → /ck:ship --official
  │                                                                                   │
  │                                                                                   ├── SUCCESS → close
  │                                                                                   └── FAIL → fallback
```

## Architecture Changes

### 1. Update MODEL_MAP

```typescript
// Before
const MODEL_MAP = {
  plan: 'claude-opus-4-5',
  cook: 'claude-sonnet-4-5',
  test: 'claude-sonnet-4-5',
  commit: 'claude-haiku-4-5-20251001',
} as const;

// After
const MODEL_MAP = {
  plan: 'claude-opus-4-5',
  'plan-red-team': 'claude-opus-4-5',
  cook: 'claude-sonnet-4-5',
  test: 'claude-sonnet-4-5',
  predict: 'claude-opus-4-5',
  ship: 'claude-sonnet-4-5',
} as const;
```

Remove `commit` key — replaced by `ship`.

### 2. Replace commitIssue() with shipIssue()

```typescript
async function shipIssue(issue: Issue): Promise<StepResult> {
  // Try /ck:ship --official first
  const shipResult = await spawnClaude('/ck:ship --official', {
    model: MODEL_MAP.ship,
    budget: opts.budget,
    permissionMode: opts.permissionMode,
    timeout: opts.timeout ?? 600,
  });

  if (shipResult.success) {
    console.log(chalk.green(`  shipped via /ck:ship`));
    return shipResult;
  }

  // Fallback to createPullRequest() from branch-manager.ts
  console.log(chalk.yellow(`  /ck:ship failed — falling back to createPullRequest()`));
  try {
    await createPullRequest(issue.number, issue.title, 'feature');
    console.log(chalk.green(`  shipped via fallback`));
    return { success: true, stdout: 'fallback PR', stderr: '', durationMs: 0 };
  } catch (err) {
    console.error(chalk.red(`  both /ck:ship and fallback failed`));
    return { success: false, stdout: '', stderr: String(err), durationMs: 0 };
  }
}
```

### 3. Add hard-mode steps

```typescript
async function redTeamPlan(issue: Issue): Promise<StepResult> {
  return spawnClaude(`/ck:plan red-team #${issue.number}: ${issue.title}`, {
    model: MODEL_MAP['plan-red-team'],
    ...commonOpts,
  });
}

async function predictIssue(issue: Issue): Promise<StepResult> {
  return spawnClaude(`/ck:predict #${issue.number}: ${issue.title}`, {
    model: MODEL_MAP.predict,
    ...commonOpts,
  });
}
```

### 4. Update executeEpic() pipeline construction

```typescript
async function executeEpic(epicNumber: number, opts: ExecutorOptions) {
  const children = fetchEpicChildren(epicNumber);

  for (const child of children) {
    if (isIssueClosed(child.number)) continue;

    // Build pipeline based on mode
    const steps: { name: Step; fn: () => Promise<StepResult> }[] = [];

    if (opts.hard) {
      steps.push({ name: 'plan', fn: () => planIssue(child, '--hard') });
      steps.push({ name: 'plan-red-team', fn: () => redTeamPlan(child) });
    } else {
      steps.push({ name: 'plan', fn: () => planIssue(child, '--fast') });
    }

    steps.push({ name: 'cook', fn: () => cookIssue(child) });
    steps.push({ name: 'test', fn: () => testIssue(child) });

    if (opts.hard) {
      steps.push({ name: 'predict', fn: () => predictIssue(child) });
    }

    steps.push({ name: 'ship', fn: () => shipIssue(child) });

    // Execute pipeline
    let allPassed = true;
    for (const step of steps) {
      const result = await step.fn();
      if (!result.success) {
        console.error(chalk.red(`  ✗ ${step.name} failed for #${child.number}`));
        allPassed = false;
        break;
      }
    }

    if (allPassed) {
      closeIssue(child.number);
      updateEpicChecklist(epicNumber, child.number);
    }
  }
}
```

### 5. Update ExecutorOptions type

```typescript
interface ExecutorOptions {
  auto?: boolean;
  hard?: boolean;          // NEW: --hard mode
  budget?: number;
  permissionMode?: 'auto' | 'skip';
  timeout?: number;
  dryRun?: boolean;
  fromIssue?: number;
}
```

### 6. Import createPullRequest from branch-manager

```typescript
import { createPullRequest } from '../watch/phases/branch-manager.js';
```

## Related Code Files

- **Modify**: `src/commands/build/epic-executor.ts`
- **Read**: `src/commands/watch/phases/branch-manager.ts` (for `createPullRequest` signature)

## Implementation Steps

1. Add `hard?: boolean` to `ExecutorOptions` interface
2. Update `MODEL_MAP`: remove `commit`, add `plan-red-team`, `predict`, `ship`
3. Update `Step` type to match new MODEL_MAP keys
4. Import `createPullRequest` from `branch-manager.ts`
5. Replace `commitIssue()` with `shipIssue()` (ship + fallback logic)
6. Add `redTeamPlan()` and `predictIssue()` step functions
7. Update `planIssue()` to accept flag param (`--fast` vs `--hard`)
8. Refactor `executeEpic()` to build pipeline dynamically based on `opts.hard`
9. Compile check: `npx tsc --noEmit`

## Task List

- [ ] 1. Add `hard` to ExecutorOptions + update MODEL_MAP + Step type
- [ ] 2. Import `createPullRequest` from branch-manager.ts
- [ ] 3. Replace `commitIssue()` with `shipIssue()` (try ship, catch fallback)
- [ ] 4. Add `redTeamPlan()` and `predictIssue()` functions
- [ ] 5. Update `planIssue()` to accept `--fast` vs `--hard` flag
- [ ] 6. Refactor `executeEpic()` to build dynamic pipeline (standard vs hard)
- [ ] 7. Compile check: `npx tsc --noEmit`

## Success Criteria

- [ ] Standard pipeline: plan --fast → cook → test → ship (with fallback)
- [ ] Hard pipeline: plan --hard → red-team → cook → test → predict → ship (with fallback)
- [ ] `/ck:ship --official` is primary PR path
- [ ] `createPullRequest()` only called when `/ck:ship` fails
- [ ] Log message indicates which path was used
- [ ] `commit` step fully removed from pipeline
- [ ] `npx tsc --noEmit` passes
