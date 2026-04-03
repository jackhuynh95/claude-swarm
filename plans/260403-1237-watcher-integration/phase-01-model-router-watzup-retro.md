---
phase: 1
title: Add retro + watzup phase configs
status: done
files_modify: [src/commands/watch/types.ts, src/commands/watch/phases/model-router.ts]
files_create: []
---

# Phase 1 — Add retro + watzup Phase Configs

## Overview

Add `retro` and `watzup` as new PhaseType entries with corresponding model-router configs. These are the only missing phase types needed for watcher integration.

## Context

- `types.ts:39-47` — PhaseType union, needs `retro` and `watzup` added
- `model-router.ts:4-28` — PHASE_CONFIGS record, needs two new entries

## Implementation Steps

### 1. Update PhaseType in types.ts

Add `'retro' | 'watzup'` to the PhaseType union at `types.ts:39-47`.

```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'security_review' | 'security_stride'
  | 'scout' | 'code_review'
  | 'scenario' | 'ui_test'
  | 'ship' | 'predict'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review'
  | 'retro' | 'watzup';
```

### 2. Add PHASE_CONFIGS entries in model-router.ts

Add after the `design_review` entry at `model-router.ts:27`:

```typescript
retro:    { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
watzup:   { model: 'sonnet', effort: 'low',    maxTurns: 2, timeoutMs: 120_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
```

Rationale:
- **retro** uses sonnet/medium — sprint reflection needs moderate depth, reads git history
- **watzup** uses sonnet/low — quick recent-changes summary, lightweight

## Todo

- [x] Add `retro` and `watzup` to PhaseType union in types.ts
- [x] Add `retro` and `watzup` configs to PHASE_CONFIGS in model-router.ts
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- PhaseType includes `retro` and `watzup`
- `getPhaseConfig('retro')` and `getPhaseConfig('watzup')` return valid configs
- No compile errors
