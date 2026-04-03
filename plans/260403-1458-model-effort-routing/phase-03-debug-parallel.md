# Phase 3 — Debug-Flow --parallel Flag

**Priority**: Low
**Status**: Complete
**Roadmap task**: #4

## Overview

Add `--parallel` flag support to debug-flow for fixing multiple related bugs concurrently. When an issue references multiple sub-issues or the issue has label `parallel`, run `/ck:fix --parallel` which fixes multiple issues in a single Claude session.

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/types.ts` | Add `parallelBugs` to `RouteFlags` |
| `src/commands/watch/phases/issue-router.ts` | Detect parallel-eligible issues |
| `src/commands/watch/phases/debug-flow.ts` | Route `--parallel` flag |

## Implementation Steps

### Step 1: types.ts — Add parallelBugs flag

Add to `RouteFlags` interface (after `quickFix`, line 68):

```typescript
export interface RouteFlags {
  designReview: boolean;
  securityScan: boolean;
  hardMode: boolean;
  ciFailure: boolean;
  hasLogs: boolean;
  quickFix: boolean;
  parallelBugs: boolean;     // NEW: multiple related bugs → /ck:fix --parallel
}
```

### Step 2: issue-router.ts — Detect parallel-eligible issues

In `detectRouteFlags()`, add detection logic:

```typescript
parallelBugs: labelNames.has('parallel') || labelNames.has('multi-bug')
  || /multiple\s+(bugs?|issues?|errors?)/i.test(body),
```

This triggers when:
- Issue has `parallel` or `multi-bug` label
- Issue body mentions "multiple bugs/issues/errors"

### Step 3: debug-flow.ts — Route --parallel flag

Update `buildFixFlags()` (line 25). Add parallel check BEFORE the default fallback but AFTER hardMode (parallel + hard doesn't make sense):

```typescript
function buildFixFlags(flags: RouteFlags): string {
  if (flags.hardMode) return '--hard';
  if (flags.securityScan) return '--security';
  if (flags.parallelBugs) return '--parallel';   // NEW
  if (flags.ciFailure) return '--ci';
  if (flags.designReview) return '--ui';
  if (flags.hasLogs) return '--logs';
  if (flags.quickFix) return '--quick';
  return '--auto';
}
```

Priority: `--parallel` ranks above `--ci`/`--ui`/`--logs`/`--quick` because if multiple bugs exist, parallel mode is the best way to handle them regardless of sub-type.

## Success Criteria

- [x] Issue with `parallel` label → `/ck:fix --parallel`
- [x] Issue body with "multiple bugs" → `/ck:fix --parallel`
- [x] `--hard` still takes priority over `--parallel`
- [x] No behavior change for existing non-parallel issues
