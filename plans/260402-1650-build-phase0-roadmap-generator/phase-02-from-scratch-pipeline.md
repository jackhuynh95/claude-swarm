---
phase: 2
priority: high
status: complete
---

# Phase 2: From-Scratch Pipeline

## Context

- [Builder Roadmap](../../docs/implement-roadmap-builder.md) — Phase 0b tasks 0i–0m
- [Phase 1: Roadmap Generator](./phase-01-roadmap-generator.md) — `generateRoadmap()` function
- [Watch Command](../../src/commands/watch/watch-command.ts) — CLI action pattern

## Overview

Create `src/commands/build/from-scratch-pipeline.ts` — a one-liner that chains: generate → init → run. For Phase 0 scope, only `generate` is implemented; `init` and `run` are stubbed with clear progress messages.

## Architecture

```
from-scratch "Add payment gateway" --auto --budget 20
  │
  ├── Step 1: generateRoadmap() → docs/implement-roadmap-{slug}.md
  │   └── (implemented in phase-01)
  │
  ├── Step 2: initFromRoadmap() → parse + create GitHub issues
  │   └── (STUB — prints "Init not yet implemented, run: claude-swarm build init @{path}")
  │
  └── Step 3: runEpics() → plan + cook + test + ship per epic
      └── (STUB — prints "Run not yet implemented, run: claude-swarm build run --all --auto")
```

## Related Code Files

**Create:**
- `src/commands/build/from-scratch-pipeline.ts`

## Implementation Steps

### 1. Pipeline options interface

```typescript
export interface FromScratchOptions {
  input: string;         // topic string or @file
  context?: string;      // --context @file
  epics?: number;        // --epics N
  auto?: boolean;        // --auto flag (passed to init/run)
  budget?: number;       // --budget N (passed to init/run)
  dryRun?: boolean;      // --dry-run (generate only)
}
```

### 2. Progress display helper

```typescript
function showStep(step: number, total: number, message: string): void
```

- Use chalk: `chalk.cyan(`[${step}/${total}]`) + message`
- Example: `[1/3] Generating roadmap...`

### 3. Main pipeline function

```typescript
export async function fromScratch(opts: FromScratchOptions): Promise<void>
```

Flow:
1. `showStep(1, 3, "Generating roadmap...")`
2. Call `generateRoadmap({ input, context, epics, dryRun })`
3. If `dryRun`: stop here, print "Dry run complete" and return
4. `showStep(2, 3, "Creating GitHub issues...")` 
5. Print stub: `"⚠ Init not yet implemented. Run manually: claude-swarm build init @{roadmapPath}"`
6. `showStep(3, 3, "Executing epics...")`
7. Print stub: `"⚠ Run not yet implemented. Run manually: claude-swarm build run --all --auto"`
8. Print summary: roadmap path, next steps

### 4. Future-proof: init and run hooks

Leave clear `// TODO: Phase 1 — replace stub with initFromRoadmap()` and `// TODO: Phase 3 — replace stub with runEpics()` comments at the stub locations. These will be implemented in later phases of the builder roadmap.

## Todo

- [ ] Create `src/commands/build/from-scratch-pipeline.ts`
- [ ] Implement `FromScratchOptions` interface
- [ ] Implement `showStep()` progress helper
- [ ] Implement `fromScratch()` main pipeline
- [ ] Wire generate step to `generateRoadmap()` from phase-01
- [ ] Add stubs for init + run with helpful manual command output
- [ ] Test: full pipeline with string input
- [ ] Test: --dry-run stops after generate
- [ ] Test: --auto and --budget are captured (for future passthrough)

## Success Criteria

- `fromScratch({ input: "Add payment gateway" })` calls generateRoadmap and shows step progress
- `--dry-run` generates roadmap but doesn't proceed to init/run
- Stubs print actionable manual commands for user
- `--auto` and `--budget` stored in options for future phases
- Progress output: `[1/3] Generating roadmap...` → `[2/3] Creating GitHub issues...` → `[3/3] Executing epics...`

## Risk Assessment

- Low risk — mostly orchestration + stubs
- Only real work is calling `generateRoadmap()` which is implemented in Phase 1
