# Phase 3: Model Router

**Priority**: High
**Status**: Pending

---

## Overview

Create `model-router.ts` — returns the correct Claude model, effort level, max turns, timeout, and allowed tools for each execution phase. Respects model overrides from issue-router (e.g. "hard" label → opus).

## Context

- Model routing table: `docs/agent-token-budget-guide.md`
- Types from `phase-01-types.md` (PhaseConfig, PhaseType, ClaudeModel)

## Related Code Files

**Create:**
- `src/commands/watch/phases/model-router.ts`

**Read:**
- `src/commands/watch/types.ts`
- `docs/agent-token-budget-guide.md`

## Implementation Steps

1. Create `src/commands/watch/phases/model-router.ts`:

```typescript
import type { PhaseType, PhaseConfig, ClaudeModel } from '../types.js';

// Phase → default config (from agent-token-budget-guide.md)
const PHASE_CONFIGS: Record<PhaseType, PhaseConfig> = {
  brainstorm:   { model: 'opus',   effort: 'max',    maxTurns: 10, timeoutMs: 600_000, tools: ['Read', 'Grep', 'Glob'] },
  plan:         { model: 'opus',   effort: 'high',   maxTurns: 8,  timeoutMs: 480_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  plan_redteam: { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  debug:        { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  clarify:      { model: 'opus',   effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  fix:          { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'] },
  test:         { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  e2e:          { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Bash'] },
  verify:       { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  security:     { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  slack_read:   { model: 'opus',   effort: 'low',    maxTurns: 2,  timeoutMs: 60_000,  tools: ['Bash'] },
  slack_report: { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Bash'] },
  journal:      { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Write'] },
  docs:         { model: 'sonnet', effort: 'low',    maxTurns: 2,  timeoutMs: 120_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
};

/**
 * Get phase config with optional model override.
 * Model override (from "hard" label) escalates model to opus.
 */
export function getPhaseConfig(
  phase: PhaseType,
  modelOverride?: ClaudeModel,
): PhaseConfig {
  const base = PHASE_CONFIGS[phase];
  if (!modelOverride) return base;

  return { ...base, model: modelOverride };
}

/**
 * Get all phase configs for a flow (debug or ship).
 * Returns ordered phase sequence.
 */
export function getFlowPhases(
  flowType: 'debug-flow' | 'ship-flow',
  noTest: boolean,
): PhaseType[] {
  if (flowType === 'debug-flow') {
    return ['debug', 'fix', 'test'];
  }

  // ship-flow
  const phases: PhaseType[] = ['plan', 'fix'];
  if (!noTest) phases.push('test');
  return phases;
}
```

2. Run `npm run build` to verify compilation

## Success Criteria

- [ ] `getPhaseConfig('debug')` returns opus/high/5 turns
- [ ] `getPhaseConfig('fix')` returns sonnet/medium/5 turns
- [ ] `getPhaseConfig('fix', 'opus')` returns opus/medium/5 turns (override)
- [ ] `getFlowPhases('debug-flow', false)` → `['debug', 'fix', 'test']`
- [ ] `getFlowPhases('ship-flow', false)` → `['plan', 'fix', 'test']`
- [ ] `getFlowPhases('ship-flow', true)` → `['plan', 'fix']` (no test for docs/chore)
- [ ] All 14 phase types have configs matching agent-token-budget-guide.md
