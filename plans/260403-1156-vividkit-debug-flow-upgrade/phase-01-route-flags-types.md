---
phase: 1
title: Extend RouteFlags & Issue Router
priority: high
status: complete
effort: small
files_modify:
  - src/commands/watch/types.ts
  - src/commands/watch/phases/issue-router.ts
---

# Phase 1 — Extend RouteFlags & Issue Router

## Context

- [types.ts](../../src/commands/watch/types.ts) — `RouteFlags` interface (line 57-61)
- [issue-router.ts](../../src/commands/watch/phases/issue-router.ts) — `detectRouteFlags()` (line 64-72)
- [Roadmap](../../docs/implement-roadmap-vividkit-commands.md) — Phase 1, tasks 2-8

## Overview

Add new route flags so debug-flow can route `/ck:fix` with the right flag per issue type. The issue-router detects these from labels and issue body content.

## Current State

```typescript
// types.ts:57-61
export interface RouteFlags {
  designReview: boolean;     // "frontend" label
  securityScan: boolean;     // "security" label
  hardMode: boolean;         // "hard" label → opus override
}

// issue-router.ts:64-72
function detectRouteFlags(issue: GHIssue): RouteFlags {
  const labelNames = new Set(issue.labels.map(l => l.name.toLowerCase()));
  return {
    hardMode: labelNames.has('hard'),
    designReview: labelNames.has('frontend') || labelNames.has('ui'),
    securityScan: labelNames.has('security'),
  };
}
```

## Implementation Steps

### 1. Extend `RouteFlags` in `types.ts` (line 57-61)

Add 3 new flags:

```typescript
export interface RouteFlags {
  designReview: boolean;     // "frontend"/"ui" label
  securityScan: boolean;     // "security" label
  hardMode: boolean;         // "hard" label → opus override
  ciFailure: boolean;        // "ci"/"ci-failure"/"pipeline" label
  hasLogs: boolean;          // issue body contains log/stacktrace content
  quickFix: boolean;         // "quick"/"trivial"/"typo" label
}
```

### 2. Update `detectRouteFlags()` in `issue-router.ts` (line 64-72)

```typescript
function detectRouteFlags(issue: GHIssue): RouteFlags {
  const labelNames = new Set(issue.labels.map(l => l.name.toLowerCase()));
  const body = (issue.body ?? '').toLowerCase();

  return {
    hardMode: labelNames.has('hard'),
    designReview: labelNames.has('frontend') || labelNames.has('ui'),
    securityScan: labelNames.has('security'),
    ciFailure: labelNames.has('ci') || labelNames.has('ci-failure') || labelNames.has('pipeline'),
    hasLogs: /```[\s\S]{50,}```|stack\s?trace|at\s+\S+\s+\(|error\s+log/i.test(issue.body ?? ''),
    quickFix: labelNames.has('quick') || labelNames.has('trivial') || labelNames.has('typo'),
  };
}
```

**`hasLogs` heuristic**: detects code blocks >50 chars, "stacktrace", function-call patterns (`at X (`), or "error log" in issue body.

## Todo

- [x] Add `ciFailure`, `hasLogs`, `quickFix` to `RouteFlags` interface in types.ts
- [x] Update `detectRouteFlags()` in issue-router.ts with new detection logic
- [x] Verify build passes (`npm run build`)

## Success Criteria

- `RouteFlags` has 6 fields (3 existing + 3 new)
- Issues with "ci" label get `ciFailure: true`
- Issues with stacktrace in body get `hasLogs: true`
- Issues with "quick"/"trivial"/"typo" label get `quickFix: true`
- Build passes
