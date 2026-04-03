---
phase: 1
title: Add scout & code_review phase types
status: completed
completed: 2026-04-03
priority: high
effort: small
---

# Phase 1 — Add scout & code_review Phase Types

## Overview

Add `scout` and `code_review` as new `PhaseType` values and configure them in model-router. These are needed for the post-cook steps in the upgraded ship-flow.

## Files to Modify

- `src/commands/watch/types.ts`
- `src/commands/watch/phases/model-router.ts`

## Implementation Steps

### 1. Update `PhaseType` in `types.ts` (line 39-43)

Add `'scout'` and `'code_review'` to the PhaseType union:

```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'scout' | 'code_review'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';
```

### 2. Add phase configs in `model-router.ts` (line 4-20)

Add entries to `PHASE_CONFIGS`:

```typescript
scout:       { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
code_review: { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
```

### 3. Update `getFlowPhases` in `model-router.ts` (line 40-52)

Update ship-flow phase sequence to include scout and code_review:

```typescript
// ship-flow
const phases: PhaseType[] = ['plan', 'fix'];
if (!noTest) phases.push('test');
phases.push('scout', 'code_review');
return phases;
```

## Success Criteria

- [x] `PhaseType` includes `scout` and `code_review`
- [x] `PHASE_CONFIGS` has entries for both new types
- [x] `getFlowPhases('ship-flow')` returns sequence including scout + code_review
- [x] TypeScript compiles without errors
