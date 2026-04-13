---
phase: 1
title: Wire cycle-guard into watcher pipeline
priority: high
status: complete
effort: small
---

# Phase 1 — Wire Cycle Guard Into Watcher Pipeline

## Context

- [cycle-guard.ts](../../src/commands/sync/cycle-guard.ts) — one-shot lock utility (P4, done)
- [post-ship-runner.ts](../../src/commands/watch/phases/post-ship-runner.ts) — calls extractKnowledge at step 12
- [ship-flow.ts](../../src/commands/watch/phases/ship-flow.ts) — calls loadVaultContext at step 3
- [watch-command.ts](../../src/commands/watch/watch-command.ts) — processIssue orchestrator

## Overview

Three surgical edits. No new files, no new dependencies.

## Key Insights

- `extractKnowledge()` already has built-in guards: mtime window, slug dedup, injected-note skip
- Cycle-guard adds inter-cycle protection: prevents re-extraction if same vault was processed <5 min ago
- `loadVaultContext` is a read-only operation — denial means stale context, not failure
- Lock must release in `finally` block to prevent permanent lockout on errors

## Implementation Steps

### 1. ship-flow.ts — Guard vault context load

File: `src/commands/watch/phases/ship-flow.ts`

```typescript
// Add import at top
import { acquireCycleLock } from '../../sync/cycle-guard.js';

// In executeShipFlow(), replace step 3 (vault context):
// BEFORE:
const vaultContext = config.vaultPath
  ? await loadVaultContext(config.vaultPath, { title: issue.title, description: issue.body ?? undefined })
  : '';

// AFTER:
let vaultContext = '';
if (config.vaultPath) {
  const lockOk = await acquireCycleLock(config.vaultPath, 'push');
  if (lockOk) {
    vaultContext = await loadVaultContext(config.vaultPath, { title: issue.title, description: issue.body ?? undefined });
    console.log(`[ship-flow] vault context loaded (${vaultContext.length} chars)`);
  } else {
    console.log('[ship-flow] cycle-guard denied vault context load — using stale');
  }
}
```

### 2. post-ship-runner.ts — Guard knowledge extraction

File: `src/commands/watch/phases/post-ship-runner.ts`

```typescript
// Add import at top
import { acquireCycleLock } from '../../sync/cycle-guard.js';

// Replace step 12 (knowledge extraction):
// BEFORE:
try {
  await extractKnowledge(config.vaultPath, classified, flowResults, results, config.repo);
} catch {
  // never block pipeline
}

// AFTER:
try {
  const lockOk = await acquireCycleLock(config.vaultPath, 'pull');
  if (lockOk) {
    await extractKnowledge(config.vaultPath, classified, flowResults, results, config.repo);
    console.log('[post-ship] knowledge extraction complete');
  } else {
    console.log('[post-ship] cycle-guard denied knowledge extraction — already ran this cycle');
  }
} catch {
  // never block pipeline
}
```

### 3. watch-command.ts — Release lock after each issue

File: `src/commands/watch/watch-command.ts`

```typescript
// Add import at top
import { releaseCycleLock } from '../sync/cycle-guard.js';

// In processIssue(), wrap the try/catch body to add finally:
// Add to the end of the existing try block (after all processing),
// and also in the catch block:

// After the existing try/catch in processIssue, add a finally:
} finally {
  // Release cycle lock if vault is configured
  if (options.vault) {
    await releaseCycleLock(options.vault);
  }
}
```

Note: `processIssue` currently has a try/catch. Convert to try/catch/finally. The `finally` ensures lock release even on errors.

## Related Code Files

| Action | File |
|--------|------|
| Modify | `src/commands/watch/phases/ship-flow.ts` |
| Modify | `src/commands/watch/phases/post-ship-runner.ts` |
| Modify | `src/commands/watch/watch-command.ts` |

## Success Criteria

- [x] `acquireCycleLock('push')` called before `loadVaultContext` in ship-flow
- [x] `acquireCycleLock('pull')` called before `extractKnowledge` in post-ship-runner
- [x] `releaseCycleLock()` called in `finally` block of processIssue
- [x] Console logs show cycle-guard status during watcher runs
- [x] `npm run build` compiles without errors
- [x] No behavior change when cycle-guard allows both ops (normal case)

## Risk Assessment

- **Low risk**: cycle-guard fails open (returns true on error) — existing behavior preserved
- **No breaking change**: all guards are advisory, never block pipeline
- **Lock TTL**: 5 min auto-expire prevents permanent lockout even if finally block skipped
