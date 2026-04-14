# Phase 01 — roadmap-generator.ts

**File**: `src/commands/build/roadmap-generator.ts`
**Priority**: high
**Status**: pending

## Overview

Replace the brainstorm step with grill-me. After a successful grill-me run, assume spec is resolved and switch plan step to `--fast` on sonnet instead of `--hard` on opus.

## Current State

```
Step 1: /ck:brainstorm ... (opus)
Step 2: /ck:plan --hard ... (opus)
Step 3: /ck:scenario ... (sonnet)
```

## Target State

```
Step 1: /grill-me ... (opus)  ← spec interview + writes spec.md
Step 2: /ck:plan --fast ... (sonnet)  ← executor mode, spec already resolved
Step 3: /ck:scenario ... (sonnet)
```

## Related Files

- `src/commands/build/roadmap-generator.ts` — only file touched

## Implementation Steps

1. Update `MODEL_MAP_GENERATE`:
   - Rename key `brainstorm` → `grillme`, keep `'claude-opus-4-6'`
   - Change key `plan` value to `'claude-sonnet-4-6'` (sonnet for --fast executor path)
   - Keep `scenario: 'claude-sonnet-4-6'` unchanged

2. Add `skipGrillMe?: boolean` to `GenerateRoadmapOptions` interface.

3. In `generateRoadmap()`:
   - Wrap step 1 in `if (!opts.skipGrillMe)` guard
   - Change prompt: `/ck:brainstorm Analyze repo and identify features/epics for: ${subject}` → `/grill-me Clarify scope, assumptions, and decisions for: ${subject}`
   - Change spinner message: `'Brainstorming scope (opus)...'` → `'Running grill-me spec interview (opus)...'`
   - Change success message: `'Brainstorm complete'` → `'Grill-me spec complete'`
   - Change error message and throw: `'Brainstorm failed'` → `'Grill-me failed'`

4. Update step 2 prompt and model:
   - Prompt: `/ck:plan --hard Generate implementation roadmap for: ${subject}` → `/ck:plan --fast Generate implementation roadmap for: ${subject}`
   - Model: use `MODEL_MAP_GENERATE.plan` (now sonnet)
   - Spinner: `'Generating roadmap with /ck:plan --hard (opus)...'` → `'Generating roadmap with /ck:plan --fast (sonnet)...'`

5. Update final console.log:
   - `'✓ Generate pipeline complete: brainstorm → roadmap → scenarios'` → `'✓ Generate pipeline complete: grill-me → roadmap → scenarios'`

6. Update dry-run console.log lines to match new step names.

## Todo

- [ ] Rename `brainstorm` → `grillme` in MODEL_MAP_GENERATE, change plan model to sonnet
- [ ] Add `skipGrillMe?: boolean` to `GenerateRoadmapOptions`
- [ ] Replace brainstorm step with grill-me step (prompt, spinner, model)
- [ ] Update step 2 to `--fast` on sonnet
- [ ] Update all console.log strings (dry-run + final)
- [ ] Compile check: `npx tsc --noEmit`

## Success Criteria

- `GenerateRoadmapOptions.skipGrillMe` flag compiles without errors
- Dry-run output shows `grill-me → plan --fast → scenarios` steps
- No reference to `brainstorm` remains in the file (except MODEL_MAP comment if kept)
