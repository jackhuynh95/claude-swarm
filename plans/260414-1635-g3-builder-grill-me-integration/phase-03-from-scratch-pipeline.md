# Phase 03 — from-scratch-pipeline.ts

**File**: `src/commands/build/from-scratch-pipeline.ts`
**Priority**: medium
**Status**: pending

## Overview

`from-scratch-pipeline.ts` delegates to `generateRoadmap()`. Grill-me is now inside `generateRoadmap()`, so this file just needs to:
1. Accept and forward `skipGrillMe`
2. Update the step-1 label from "Generating roadmap..." to "Running grill-me + generating roadmap..." so the UX is accurate

## Related Files

- `src/commands/build/from-scratch-pipeline.ts` — only file touched
- `src/commands/build/roadmap-generator.ts` — provides updated `GenerateRoadmapOptions.skipGrillMe`

## Implementation Steps

1. Add `skipGrillMe?: boolean` to `FromScratchOptions` interface.

2. Pass `skipGrillMe: opts.skipGrillMe` into the `generateRoadmap()` call.

3. Update step 1 label:
   - From: `showStep(1, 3, 'Generating roadmap...')`
   - To: `showStep(1, 3, opts.skipGrillMe ? 'Generating roadmap...' : 'Running grill-me + generating roadmap...')`

## Todo

- [ ] Add `skipGrillMe?: boolean` to `FromScratchOptions`
- [ ] Forward `skipGrillMe` to `generateRoadmap()` call
- [ ] Update step 1 label to reflect grill-me
- [ ] Compile check: `npx tsc --noEmit`

## Success Criteria

- `FromScratchOptions.skipGrillMe` compiles and forwards correctly
- Step label accurately reflects whether grill-me runs
