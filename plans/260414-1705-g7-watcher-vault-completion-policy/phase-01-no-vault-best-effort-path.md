---
phase: 01
title: "No-vault best-effort debrief path + messaging"
status: complete
priority: high
effort: small
---

# Phase 01 — No-Vault Best-Effort Debrief Path

## Context Links

- Plan: `plans/260414-1705-g7-watcher-vault-completion-policy/plan.md`
- Roadmap: G7, task #37 — "watcher without --vault: best-effort debrief; with --vault: official completion"
- Primary file: `src/commands/watch/watch-command.ts`
- Reference pattern: `post-ship-runner.ts` invokeClaudePhase calls (scout, predict, llms)

## Overview

- **Priority**: high
- **Status**: complete
- **Description**: Add a lightweight best-effort debrief call in the no-vault branch of `watch-command.ts` (lines 196–198). Update console status messages to surface the vault policy clearly.

## Key Insights

- `watch-command.ts` line 181 branches on `options.vault`: vault=yes → `executePostShip()`; vault=no → simple log
- No-vault path currently does zero post-ship work — we need to add one best-effort debrief `invokeClaudePhase` call
- `invokeClaudePhase` is already imported in `post-ship-runner.ts`; **not** imported in `watch-command.ts` → either import it or keep the debrief in a helper
- Cleanest KISS approach: extract a thin `executeBestEffortDebrief()` from `post-ship-runner.ts` that takes `ClassifiedIssue` and `cwd?`, calls `invokeClaudePhase`, logs the artifact, and never throws
- Status message change: "flow complete" → "BEST-EFFORT COMPLETE — no vault trace (not official)"

## Requirements

### Functional
- Without `--vault`: best-effort debrief runs after ship flow, before the summary log
- Debrief failure never blocks or throws
- Console output clearly states this is best-effort / unofficial

### Non-functional
- No new top-level module — add `executeBestEffortDebrief()` to `post-ship-runner.ts` (exported)
- `watch-command.ts` imports and calls it
- Keep both files under 200 lines

## Related Code Files

- **Modify**: `src/commands/watch/watch-command.ts` (no-vault branch, ~lines 196–199)
- **Modify**: `src/commands/watch/phases/post-ship-runner.ts` (add exported helper, ~20 lines)

## Implementation Steps

### 1. Add `executeBestEffortDebrief()` export to `post-ship-runner.ts`

Add after `parseShipResult()` (around line 72), before `executePostShip()`:

```typescript
/**
 * Lightweight debrief for runs without --vault.
 * Best-effort only — never throws, never blocks.
 */
export async function executeBestEffortDebrief(
  classified: ClassifiedIssue,
  autoMode: boolean,
  cwd?: string,
): Promise<void> {
  const { issue, issueType } = classified;
  const prompt = `/ck:debrief Compare spec vs built for #${issue.number}: ${issue.title}

Type: ${issueType} | Mode: best-effort (no vault)
Check plans/ for spec.md and plan.md. Write debrief.md to plans/reports/.`;

  try {
    const result = await invokeClaudePhase(prompt, 'debrief', undefined, undefined, autoMode, cwd);
    if (result.artifacts?.length) {
      console.log(`[post-ship] debrief artifact: ${result.artifacts[0]}`);
    }
  } catch {
    // never block
  }
}
```

### 2. Update no-vault branch in `watch-command.ts`

Replace the current no-vault else block (lines ~196–199):

```typescript
// BEFORE:
} else {
  const failCount = flowResults.filter(r => !r.success).length;
  console.log(`[watch] #${issue.number} flow complete — phases=${flowResults.length} failures=${failCount}`);
}
```

```typescript
// AFTER:
} else {
  // No vault — run best-effort debrief only; not officially traceable
  await executeBestEffortDebrief(classified, options.auto, config.cwd);
  const failCount = flowResults.filter(r => !r.success).length;
  console.log(
    `[watch] #${issue.number} BEST-EFFORT COMPLETE — phases=${flowResults.length} failures=${failCount} | no vault trace (not official)`
  );
}
```

### 3. Add import in `watch-command.ts`

Add `executeBestEffortDebrief` to the existing import from `post-ship-runner.ts`:

```typescript
import { executePostShip, executeBestEffortDebrief } from './phases/post-ship-runner.js';
```

## Todo List

- [x] Add `executeBestEffortDebrief()` export to `post-ship-runner.ts`
- [x] Update no-vault else branch in `watch-command.ts` to call it
- [x] Add `executeBestEffortDebrief` to import in `watch-command.ts`
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- `npx tsc --noEmit` passes
- Without `--vault`: console prints "BEST-EFFORT COMPLETE — … no vault trace (not official)"
- With `--vault`: existing behavior unchanged
- `executeBestEffortDebrief` never throws

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `invokeClaudePhase` signature change | Low | Check post-ship-runner.ts call sites before copy |
| `watch-command.ts` already imports from post-ship-runner | Medium | Verify import exists, extend it |
| 200-line limit on post-ship-runner.ts | Low | Helper is ~20 lines; currently 234 lines → modularize buildXxxPrompt helpers if needed |

## Security Considerations

- `issue.number` and `issue.title` from GitHub API, already sanitized upstream — safe to interpolate into prompt string

## Next Steps

- Phase 02: vault-path official completion gate (adds `officialComplete` field to `PostShipResult`, asserts vault trace after debrief)
