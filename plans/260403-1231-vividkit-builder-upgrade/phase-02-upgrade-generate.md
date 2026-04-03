---
phase: 2
title: Upgrade Build Generate + Scenario Generation
status: pending
priority: high
effort: low
---

# Phase 2: Upgrade Build Generate + Scenario Generation

**Goal**: `build generate` uses `/ck:brainstorm` → `/ck:plan --hard` for roadmap creation. Add `/ck:scenario` to generate test cases per epic issue.

## Context

- [VividKit roadmap Phase 6, tasks 40+45](../../docs/implement-roadmap-vividkit-commands.md)
- [roadmap-generator plan](../260402-1650-build-phase0-roadmap-generator/plan.md)

## Current State

`build generate` (in `roadmap-generator.ts` or `build-command.ts`) spawns Claude with a prompt to generate a roadmap from repo analysis. Uses a single Claude call.

## Target State

```
build generate:
  │
  ├── /ck:brainstorm (explore scope, clarify ambiguity)
  ├── /ck:plan --hard (generate full roadmap with deep analysis)
  ├── /ck:scenario (generate BDD test cases per issue in roadmap)
  │
  └── output: roadmap.md + test scenarios
```

## Architecture Changes

### 1. Update generate pipeline in roadmap-generator.ts

Currently: single `spawnClaude("/ck:plan ...")` call.

After: 3-step pipeline:

```typescript
async function generateRoadmap(opts: GenerateOptions): Promise<void> {
  // Step 1: Brainstorm — explore scope
  await spawnClaude('/ck:brainstorm Analyze repo and identify features/epics for roadmap', {
    model: MODEL_MAP_GENERATE.brainstorm,
    budget: opts.budget,
    timeout: opts.timeout ?? 600,
  });

  // Step 2: Plan --hard — generate full roadmap
  await spawnClaude('/ck:plan --hard Generate implementation roadmap from brainstorm output', {
    model: MODEL_MAP_GENERATE.plan,
    budget: opts.budget,
    timeout: opts.timeout ?? 600,
  });

  // Step 3: Scenario — generate test cases per epic
  await spawnClaude('/ck:scenario Generate BDD test scenarios for each epic in the roadmap', {
    model: MODEL_MAP_GENERATE.scenario,
    budget: opts.budget,
    timeout: opts.timeout ?? 600,
  });
}
```

### 2. Add generation-specific model map

```typescript
const MODEL_MAP_GENERATE = {
  brainstorm: 'claude-opus-4-5',    // deep creative thinking
  plan: 'claude-opus-4-5',          // architectural reasoning
  scenario: 'claude-sonnet-4-5',    // test case generation
} as const;
```

## Related Code Files

- **Modify**: `src/commands/build/epic-executor.ts` (or wherever `generateRoadmap` lives — likely `roadmap-generator.ts`)
- **Modify**: `src/commands/build/build-command.ts` (if generate wiring needs update)

## Implementation Steps

1. Locate the generate function (likely in `roadmap-generator.ts`)
2. Add `MODEL_MAP_GENERATE` constant for brainstorm/plan/scenario models
3. Replace single Claude call with 3-step pipeline: brainstorm → plan --hard → scenario
4. Ensure each step's output is available to the next (Claude CLI sessions in same working dir)
5. Compile check: `npx tsc --noEmit`

## Task List

- [ ] 1. Add `MODEL_MAP_GENERATE` constant (brainstorm=opus, plan=opus, scenario=sonnet)
- [ ] 2. Refactor generate function to 3-step pipeline: brainstorm → plan --hard → scenario
- [ ] 3. Wire `/ck:scenario` as final step to generate BDD test cases per epic
- [ ] 4. Compile check: `npx tsc --noEmit`

## Success Criteria

- [ ] `build generate` runs `/ck:brainstorm` first
- [ ] `build generate` runs `/ck:plan --hard` (not `--fast`) for roadmap
- [ ] `build generate` runs `/ck:scenario` to produce test cases
- [ ] 3 sequential Claude subprocess calls with correct models
- [ ] `npx tsc --noEmit` passes
