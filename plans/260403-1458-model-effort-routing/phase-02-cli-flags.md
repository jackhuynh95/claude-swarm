# Phase 2 — CLI Flags for Watch + Build Commands

**Priority**: High
**Status**: Complete
**Roadmap tasks**: M2, M3
**Depends on**: Phase 1

## Overview

Add `--model` and `--effort` CLI flags to `watch` command and `build run/plan/cook` subcommands. Wire flags through to `getPhaseConfig()` via the override chain.

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/watch-command.ts` | Add `--model`, `--effort` options; thread to flows |
| `src/commands/build/build-command.ts` | Add `--model`, `--effort` to `run`, `plan`, `cook` |
| `src/commands/build/epic-executor.ts` | Replace `MODEL_MAP` with `getPhaseConfig()`; accept overrides |

## Implementation Steps

### Step 1: watch-command.ts — Add CLI options (line 29)

After `.option('--dry-run', ...)`:

```typescript
.option('--model <model>', 'Override model for all phases (opus|sonnet|haiku)')
.option('--effort <level>', 'Override effort for all phases (low|medium|high|max)')
```

### Step 2: watch-command.ts — Load config models + build overrides

In the action handler (line 30), after `loadProjectConfig()`:

```typescript
const configModels = projectConfig.models;
const cliOverrides: ModelOverrides = {};
if (options.model) cliOverrides.model = options.model as ClaudeModel;
if (options.effort) cliOverrides.effort = options.effort as EffortLevel;
```

### Step 3: watch-command.ts — Thread to pollAndDispatch

Update `pollAndDispatch` signature and all flow dispatch calls to pass `configModels` and `cliOverrides`:

```typescript
async function pollAndDispatch(
  config: WatchConfig,
  options: {
    auto: boolean; vault?: string; baseUrl?: string;
    redTeam: boolean; useTeam: boolean; dryRun: boolean;
    configModels?: Record<string, PhaseModelConfig>;
    cliOverrides?: ModelOverrides;
  },
): Promise<void> {
```

Update `processIssue` similarly. In the flow dispatch:

```typescript
// Merge issue-level model override with CLI overrides
const issueOverrides: ModelOverrides = {
  model: options.cliOverrides?.model ?? classified.modelOverride,
  effort: options.cliOverrides?.effort,
};

if (classified.flowType === 'debug-flow') {
  flowResults = await executeDebugFlow(classified, {
    repo: config.repo,
    maxCycles: 3,
    autoMode: options.auto,
    configModels: options.configModels,
    cliOverrides: issueOverrides,
  });
} else {
  flowResults = await executeShipFlow(classified, {
    repo: config.repo,
    autoMode: options.auto,
    noTest: classified.noTest,
    vaultPath: options.vault,
    configModels: options.configModels,
    cliOverrides: issueOverrides,
  });
}
```

### Step 4: build-command.ts — Add CLI options

Add to `run` subcommand (after line 81 `--dry-run`):

```typescript
.option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
.option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
```

Add same options to `plan` and `cook` subcommands.

Pass through to `ExecutorOptions`:

```typescript
const executorOpts = {
  // ... existing
  model: opts.model,
  effort: opts.effort,
};
```

### Step 5: epic-executor.ts — Replace MODEL_MAP with model-router

Remove hardcoded `MODEL_MAP` (lines 8-15). Import and use `getPhaseConfig()`:

```typescript
import { getPhaseConfig } from '../watch/phases/model-router.js';
import { loadProjectConfig } from '../../config-resolver.js';
import type { ClaudeModel, EffortLevel, ModelOverrides, PhaseModelConfig, PhaseType } from '../watch/types.js';
```

Add to `ExecutorOptions`:

```typescript
export interface ExecutorOptions {
  // ... existing
  model?: ClaudeModel;
  effort?: EffortLevel;
}
```

Map builder step names to PhaseType:

```typescript
const STEP_TO_PHASE: Record<Step, PhaseType> = {
  plan: 'plan',
  'plan-red-team': 'plan_redteam',
  cook: 'cook',
  test: 'test',
  predict: 'predict',
  ship: 'ship',
};
```

Refactor `runStep()`:

```typescript
async function runStep(step: Step, prompt: string, opts: ExecutorOptions): Promise<StepResult> {
  const configModels = loadProjectConfig()?.models;
  const cliOverrides: ModelOverrides = {};
  if (opts.model) cliOverrides.model = opts.model;
  if (opts.effort) cliOverrides.effort = opts.effort;

  const phase = STEP_TO_PHASE[step];
  const config = getPhaseConfig(phase, configModels, cliOverrides);

  return spawnClaude(prompt, {
    model: `claude-${config.model}-4-5`,  // map short name to full model ID
    budget: opts.budget,
    permissionMode: opts.permissionMode,
    timeout: opts.timeout,
  });
}
```

**Note**: Model name mapping `opus` → `claude-opus-4-5`. The model-router returns short names (`opus`, `sonnet`, `haiku`), but `spawnClaude` needs full Claude model IDs. Add a helper:

```typescript
function toModelId(model: ClaudeModel): string {
  const ids: Record<ClaudeModel, string> = {
    opus: 'claude-opus-4-5',
    sonnet: 'claude-sonnet-4-5',
    haiku: 'claude-haiku-4-5',
  };
  return ids[model];
}
```

### Step 6: Optimize config loading in epic-executor

`loadProjectConfig()` reads from disk. Cache it once per epic execution instead of per step:

```typescript
export async function executeEpic(epicNumber: number, opts: ExecutorOptions = {}): Promise<void> {
  const configModels = loadProjectConfig()?.models;
  // ... pass configModels to runStep or store module-level
}
```

Simplest: load once at top of `executeEpic`/`executeAllEpics` and pass through.

## .claude-swarm.json Example

```json
{
  "repo": "owner/repo",
  "auto": true,
  "models": {
    "plan": { "model": "opus", "effort": "high" },
    "cook": { "model": "sonnet", "effort": "medium" },
    "fix": { "model": "sonnet", "effort": "medium" },
    "test": { "model": "sonnet", "effort": "low" },
    "security": { "model": "sonnet", "effort": "medium" },
    "red-team": { "model": "opus", "effort": "high" },
    "report": { "model": "haiku", "effort": "low" }
  }
}
```

## CLI Usage Examples

```bash
# Override all phases to sonnet low (cost saving)
claude-swarm watch --auto --model sonnet --effort low

# Override just effort (keep per-phase model routing)
claude-swarm watch --auto --effort low

# Builder with model override
claude-swarm build run --epic 42 --model sonnet --effort medium --auto
```

## Success Criteria

- [x] `claude-swarm watch --model sonnet --effort low` passes overrides to all phases
- [x] `claude-swarm build run --epic 42 --model opus` uses opus for all steps
- [x] Builder no longer uses hardcoded MODEL_MAP
- [x] Config file models section respected when no CLI override
- [x] Issue-level "hard" label still escalates model to opus (unless CLI overrides)
