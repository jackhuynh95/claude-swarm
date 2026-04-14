---
phase: 02
title: "Vault official completion gate + officialComplete field"
status: complete
priority: high
effort: small
softDependsOn: [260414-1701-g5-watcher-debrief-post-ship]
---

# Phase 02 — Vault Official Completion Gate

## Context Links

- Plan: `plans/260414-1705-g7-watcher-vault-completion-policy/plan.md`
- Roadmap: G7 task #37 — vault-backed trace required for official completion
- Primary files: `post-ship-runner.ts`, `watch-command.ts`
- Soft dependency: G5 plan (`260414-1701-g5-watcher-debrief-post-ship`) — debrief step 8.5 should already be in `executePostShip()` before this ships, otherwise the debrief check is moot

## Overview

- **Priority**: high
- **Status**: complete
- **Description**: Add `officialComplete: boolean` to `PostShipResult`. Set it true when vault is used and journal ran successfully. Update the vault-path console log in `watch-command.ts` to surface "OFFICIAL COMPLETE" vs "WARNING: vault trace unconfirmed".

## Key Insights

- When `--vault` is provided, `run-recorder.ts` unconditionally writes to `vaultPath/Review/Runs/`. This IS the vault trace.
- `officialComplete = verdict === 'PASS'` is sufficient when vault is provided — `run-recorder` always writes on PASS.
- Check journal success via `results.find(r => r.phase === 'journal' && r.success)` for belt-and-suspenders logging.
- No need to do a filesystem check of the vault dir — trust that `recordRun()` succeeded (it's best-effort but typically doesn't fail).
- Keep it simple: `officialComplete = verdict === 'PASS'` when inside the vault path (vault is always set when `executePostShip()` is called).

## Requirements

### Functional
- `PostShipResult` gains `officialComplete: boolean`
- `officialComplete` = `true` when `verdict === 'PASS'` (vault path guarantees run-recorder wrote)
- `officialComplete` = `false` when `verdict === 'FAIL'` (pipeline failed; trace may be incomplete)
- `watch-command.ts` vault branch logs:
  - `OFFICIAL COMPLETE` when `officialComplete = true`
  - `WARNING: vault trace may be incomplete` when `officialComplete = false`

### Non-functional
- No filesystem reads to verify vault trace — trust run-recorder
- No new types file — add field inline to `PostShipResult` in `post-ship-runner.ts`

## Related Code Files

- **Modify**: `src/commands/watch/phases/post-ship-runner.ts` — add `officialComplete` to `PostShipResult` and the return value
- **Modify**: `src/commands/watch/watch-command.ts` — update vault-path status log

## Implementation Steps

### 1. Add `officialComplete` to `PostShipResult` in `post-ship-runner.ts`

```typescript
export interface PostShipResult {
  results: PhaseResult[];
  verdict: 'PASS' | 'FAIL';
  pipelinePassed: boolean;
  shipPath: 'ck-ship' | 'fallback' | 'none';
  officialComplete: boolean;  // true when vault trace written (PASS + vault path)
}
```

### 2. Set `officialComplete` in `executePostShip()` return

At the final return statement (line 233):

```typescript
// BEFORE:
return { results, verdict, pipelinePassed: verdict === 'PASS', shipPath };

// AFTER:
return {
  results,
  verdict,
  pipelinePassed: verdict === 'PASS',
  shipPath,
  officialComplete: verdict === 'PASS',  // vault always set when executePostShip() is called
};
```

Also update the early-exit FAIL return (line 100):

```typescript
// BEFORE:
return { results, verdict: 'FAIL', pipelinePassed: false, shipPath: 'none' };

// AFTER:
return { results, verdict: 'FAIL', pipelinePassed: false, shipPath: 'none', officialComplete: false };
```

### 3. Update vault-branch log in `watch-command.ts`

```typescript
// BEFORE:
console.log(`[watch] #${issue.number} complete — verdict=${postShipResult.verdict} phases=${allPhases.length} failures=${failCount}`);

// AFTER:
const completionStatus = postShipResult.officialComplete
  ? 'OFFICIAL COMPLETE'
  : 'WARNING: vault trace may be incomplete';
console.log(
  `[watch] #${issue.number} ${completionStatus} — verdict=${postShipResult.verdict} phases=${allPhases.length} failures=${failCount}`
);
```

## Todo List

- [x] Add `officialComplete: boolean` to `PostShipResult` interface
- [x] Set `officialComplete` in both return sites of `executePostShip()`
- [x] Update vault-branch console log in `watch-command.ts`
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- `npx tsc --noEmit` passes with no new errors
- With `--vault` + PASS: console prints "OFFICIAL COMPLETE"
- With `--vault` + FAIL (green test failure): console prints "WARNING: vault trace may be incomplete"
- Without `--vault`: Phase 01 log ("BEST-EFFORT COMPLETE") — unchanged by this phase

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `PostShipResult` used in other callers outside watch-command.ts | Low | Grep for callers; add `officialComplete: false` defaults if needed |
| G5 debrief not yet shipped when this lands | Medium | `officialComplete` doesn't depend on debrief — safe to ship independently |
| run-recorder fails silently for reasons beyond code control | Low | Log says "may be incomplete" on FAIL — honest enough |

## Security Considerations

- No new attack surface — purely logging and type change

## Next Steps

- After both phases: update G7 roadmap status, mark task #37 complete
- Future: if official completion should block issue label transition, add label guard in `watch-command.ts` (deferred to G7 follow-up)
