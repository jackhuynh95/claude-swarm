---
phase: 3
title: Add watzup + retro to watch daemon poll cycle
status: done
files_modify: [src/commands/watch/watch-command.ts]
files_create: []
---

# Phase 3 — Add watzup + retro to Watch Daemon Poll Cycle

## Overview

Add `/ck:watzup` call at the start of each poll cycle (recent changes summary before processing issues) and `/ck:retro` call at end of nightly run (sprint retrospective after all issues processed).

## Context

- `watch-command.ts:61-83` — `pollAndDispatch()` is the poll cycle entry point
- `watch-command.ts:54-56` — main loop: first poll immediate, then setInterval
- `invokeClaudePhase` from `./phases/claude-invoker.js` — used to invoke claude commands

## Implementation Steps

### 1. Import invokeClaudePhase

At top of `watch-command.ts`, add:

```typescript
import { invokeClaudePhase } from './phases/claude-invoker.js';
```

### 2. Add /ck:watzup at start of pollAndDispatch()

At the top of `pollAndDispatch()`, before fetching issues, add a watzup call. This gives context on recent changes before processing new issues.

```typescript
async function pollAndDispatch(
  config: WatchConfig,
  options: { auto: boolean; vault?: string; baseUrl?: string; redTeam: boolean; useTeam: boolean; dryRun: boolean },
): Promise<void> {
  try {
    // Watzup — quick recent changes summary before processing
    const watzupResult = await invokeClaudePhase(
      '/ck:watzup Review recent git changes and summarize current project state.',
      'watzup', undefined, options.auto,
    );
    if (watzupResult.output) {
      console.log(`[watch] watzup: ${watzupResult.output.slice(0, 200)}`);
    }

    const issues = await fetchTriggerIssues(config.repo, config.labels.trigger);
    // ... rest unchanged
```

### 3. Add /ck:retro after all issues processed in a poll cycle

After the issue processing loop completes (and at least one issue was processed), call retro. This provides a sprint reflection summary.

```typescript
    // After the for-loop over issues:
    if (issues.length > 0 && !options.dryRun) {
      const retroResult = await invokeClaudePhase(
        `/ck:retro Sprint retrospective: ${issues.length} issue(s) processed this cycle. Summarize what was done, what went well, what needs improvement.`,
        'retro', undefined, options.auto,
      );
      if (retroResult.output) {
        console.log(`[watch] retro: ${retroResult.output.slice(0, 200)}`);
      }
    }
```

### 4. Pass autoMode through options

`invokeClaudePhase` already accepts `autoMode` as 4th arg. Options already has `auto` boolean. No config changes needed.

## Design Decisions

- **watzup runs every poll cycle** — lightweight (sonnet/low, 2 turns, 120s timeout). Gives context even when no issues found.
- **retro runs only when issues were processed** — no point in retrospective if nothing happened. Uses sonnet/medium for moderate analysis depth.
- **Both are best-effort** — failures logged but don't stop the poll cycle. Wrapped inside existing try/catch.

## Todo

- [x] Import `invokeClaudePhase` in watch-command.ts
- [x] Add `/ck:watzup` call at top of `pollAndDispatch()`
- [x] Add `/ck:retro` call after issue processing loop (only when issues processed)
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- `/ck:watzup` runs at start of every poll cycle
- `/ck:retro` runs after issues are processed in a cycle
- Both are best-effort (don't crash the daemon on failure)
- Console output includes watzup/retro summaries (truncated to 200 chars)
- No compile errors
