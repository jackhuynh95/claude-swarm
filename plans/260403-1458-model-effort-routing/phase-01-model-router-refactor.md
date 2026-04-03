# Phase 1 — Refactor model-router + Extend Config

**Priority**: High
**Status**: Complete
**Roadmap tasks**: M1, M4, M5

## Overview

Refactor `model-router.ts` to implement 3-level override chain. Extend `config-resolver.ts` and `types.ts` with models config shape.

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/types.ts` | Add `ModelOverrides`, `PhaseModelConfig`, add `cook` to `PhaseType`, extend `ProjectConfig` ref |
| `src/config-resolver.ts` | Add `models` to `ProjectConfig`, add `PhaseModelConfig` type |
| `src/commands/watch/phases/model-router.ts` | 3-level resolve: CLI > config > defaults |

## Implementation Steps

### Step 1: Extend types.ts (lines 26-48)

Add `cook` to `PhaseType` union:

```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'cook' | 'test' | 'e2e' | 'verify' | 'security'
  // ... rest unchanged
```

Add new interfaces after `EffortLevel` (line 27):

```typescript
/** Per-phase model+effort override from .claude-swarm.json */
export interface PhaseModelConfig {
  model?: ClaudeModel;
  effort?: EffortLevel;
}

/** Global CLI overrides — apply to ALL phases */
export interface ModelOverrides {
  model?: ClaudeModel;
  effort?: EffortLevel;
}
```

### Step 2: Extend config-resolver.ts (line 7-16)

Add `models` field to `ProjectConfig`:

```typescript
import type { PhaseModelConfig } from './commands/watch/types.js';

export interface ProjectConfig {
  repo?: string;
  vault?: string;
  baseUrl?: string;
  interval?: number;
  maxPerHour?: number;
  auto?: boolean;
  redTeam?: boolean;
  useTeam?: boolean;
  models?: Record<string, PhaseModelConfig>;  // NEW: per-phase overrides
}
```

### Step 3: Refactor model-router.ts

Add `cook` entry to PHASE_CONFIGS (after `fix`, line 10):

```typescript
cook: { model: 'sonnet', effort: 'medium', maxTurns: 5, timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'] },
```

Add kebab-case → PhaseType mapping:

```typescript
/** Map config kebab-case keys to PhaseType enum values */
const CONFIG_KEY_MAP: Record<string, PhaseType> = {
  'brainstorm': 'brainstorm',
  'plan': 'plan',
  'plan-red-team': 'plan_redteam',
  'red-team': 'plan_redteam',
  'debug': 'debug',
  'clarify': 'clarify',
  'fix': 'fix',
  'cook': 'cook',
  'test': 'test',
  'e2e': 'e2e',
  'verify': 'verify',
  'security': 'security',
  'security-review': 'security_review',
  'security-stride': 'security_stride',
  'scout': 'scout',
  'code-review': 'code_review',
  'scenario': 'scenario',
  'ui-test': 'ui_test',
  'ship': 'ship',
  'predict': 'predict',
  'slack-read': 'slack_read',
  'slack-report': 'slack_report',
  'journal': 'journal',
  'docs': 'docs',
  'design-review': 'design_review',
  'retro': 'retro',
  'watzup': 'watzup',
};
```

Refactor `getPhaseConfig()` to accept 3-level overrides:

```typescript
import type { PhaseType, PhaseConfig, ClaudeModel, EffortLevel, ModelOverrides, PhaseModelConfig } from '../types.js';

/**
 * Resolve phase config with 3-level override chain:
 *   CLI flags (global) > .claude-swarm.json (per-phase) > PHASE_CONFIGS (defaults)
 *
 * @param phase - The phase to resolve config for
 * @param configModels - Per-phase overrides from .claude-swarm.json `models` section
 * @param cliOverrides - Global CLI --model/--effort flags (override ALL phases)
 */
export function getPhaseConfig(
  phase: PhaseType,
  configModels?: Record<string, PhaseModelConfig>,
  cliOverrides?: ModelOverrides,
): PhaseConfig {
  // Level 1: defaults
  const base = { ...PHASE_CONFIGS[phase] };

  // Level 2: config file per-phase overrides
  if (configModels) {
    // Find matching config entry (try PhaseType directly, then reverse-map)
    const configEntry = configModels[phase] ?? findConfigEntry(phase, configModels);
    if (configEntry) {
      if (configEntry.model) base.model = configEntry.model;
      if (configEntry.effort) base.effort = configEntry.effort;
    }
  }

  // Level 3: CLI global overrides (highest priority)
  if (cliOverrides?.model) base.model = cliOverrides.model;
  if (cliOverrides?.effort) base.effort = cliOverrides.effort;

  return base;
}

/** Reverse-lookup: find config entry for a PhaseType via CONFIG_KEY_MAP */
function findConfigEntry(
  phase: PhaseType,
  configModels: Record<string, PhaseModelConfig>,
): PhaseModelConfig | undefined {
  for (const [key, mappedPhase] of Object.entries(CONFIG_KEY_MAP)) {
    if (mappedPhase === phase && configModels[key]) return configModels[key];
  }
  return undefined;
}
```

### Step 4: Update claude-invoker.ts

Update `invokeClaudePhase()` to pass through the new override params:

```typescript
export async function invokeClaudePhase(
  prompt: string,
  phase: PhaseType,
  configModels?: Record<string, PhaseModelConfig>,
  cliOverrides?: ModelOverrides,
  autoMode?: boolean,
  cwd?: string,
): Promise<PhaseResult> {
  const config = getPhaseConfig(phase, configModels, cliOverrides);
  const result = await invokeClaude({ prompt, config, autoMode, cwd });
  return { ...result, phase };
}
```

**IMPORTANT**: This changes the signature. All callers must be updated (debug-flow.ts, ship-flow.ts, post-ship-runner.ts, watch-command.ts). The old `modelOverride?: ClaudeModel` param is replaced by the two new params.

### Step 5: Update all invokeClaudePhase callers

Every call to `invokeClaudePhase(prompt, phase, classified.modelOverride, ...)` becomes:

```typescript
invokeClaudePhase(prompt, phase, configModels, cliOverrides, autoMode, cwd)
```

Where `configModels` and `cliOverrides` are threaded down from the command entry point.

**Affected files and approximate call counts:**
- `debug-flow.ts` — 4 calls (lines 95, 112, 133, 149)
- `ship-flow.ts` — ~6 calls
- `post-ship-runner.ts` — ~8 calls
- `watch-command.ts` — 2 calls (watzup, retro)

The `modelOverride` from `ClassifiedIssue` (hard label → opus) should be folded into `cliOverrides` at the call site if present.

### Step 6: Thread overrides through flow configs

Add to `DebugFlowConfig`, `ShipFlowConfig`, `PostShipConfig`:

```typescript
configModels?: Record<string, PhaseModelConfig>;
cliOverrides?: ModelOverrides;
```

Merge `classified.modelOverride` into `cliOverrides` at dispatch time in `watch-command.ts`:

```typescript
const cliOverrides: ModelOverrides = {
  model: options.model ?? classified.modelOverride,
  effort: options.effort,
};
```

## Success Criteria

- [x] `getPhaseConfig('plan')` returns opus/high (default)
- [x] `getPhaseConfig('plan', { plan: { model: 'sonnet' } })` returns sonnet/high
- [x] `getPhaseConfig('plan', { plan: { model: 'sonnet' } }, { model: 'haiku' })` returns haiku/high
- [x] Config file `red-team` key maps to `plan_redteam` PhaseType
- [x] `cook` PhaseType exists and defaults to sonnet/medium
- [x] All existing callers updated to new signature
