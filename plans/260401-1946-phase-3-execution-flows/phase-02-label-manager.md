# Phase 02: Label Manager

**Priority**: High (used by both flows)
**Status**: Complete

---

## Overview

Extract GitHub label transition logic into a shared module. Both debug-flow and ship-flow transition labels (ready_for_dev -> shipped -> verified). Ported from `transition_label()` in `fix-issue.sh:649-675` and `ship-issue.sh:516-542`.

## Context Links

- Types: `src/commands/watch/types.ts` (WatchConfig.labels)
- Source: `auto-claude/fix-issue.sh` lines 649-675
- Source: `auto-claude/ship-issue.sh` lines 516-542

## Architecture

```
transitionLabel(issueNum, remove, add)
  ├── gh issue edit --remove-label <remove>
  ├── gh issue edit --add-label <add>
  ├── Retry propagation check (3x 2s)
  └── Return success/timeout
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/label-manager.ts`

## Implementation Steps

1. Create `label-manager.ts` with functions:
   - `transitionLabel(repo, issueNum, remove?, add?)`: runs `gh issue edit` via `child_process.execFile`
   - `ensureLabelExists(repo, label, description, color)`: creates label if missing (from `step_5_pr` pattern)
   - `addComment(repo, issueNum, body)`: posts issue comment via `gh issue comment`

2. `transitionLabel` logic:
   - Remove old label: `gh issue edit <num> --remove-label <label> -R <repo>`
   - Add new label: `gh issue edit <num> --add-label <label> -R <repo>`
   - Propagation check: poll `gh issue view` up to 3 times, 2s apart
   - Return boolean (propagated or timed out)

3. Predefined transitions (constants):
   ```ts
   const TRANSITIONS = {
     startWork:    { remove: 'ready_for_dev', add: undefined },
     shipped:      { remove: 'ready_for_dev', add: 'shipped' },
     readyForTest: { remove: 'ready_for_dev', add: 'ready_for_test' },
     verified:     { remove: 'shipped', add: 'verified' },
     error:        { remove: undefined, add: 'error' },
     needsRefix:   { remove: 'shipped', add: 'needs_refix' },
   } as const;
   ```

4. All `gh` calls use `execFile` (not `exec`) for safety — no shell injection.

## Todo

- [x] Create `label-manager.ts`
- [x] Implement transitionLabel with gh CLI
- [x] Implement ensureLabelExists
- [x] Implement addComment
- [x] Add predefined TRANSITIONS constant
- [x] Verify `npm run build` compiles

## Success Criteria

- [x] Labels transition via `gh` CLI correctly
- [x] Propagation check retries up to 3 times
- [x] No shell injection (execFile, not exec)
- [x] Comments post to issues

## Implementation Notes

- Module exports `transitionLabel()`, `ensureLabelExists()`, and `addComment()`
- All operations use `execFile` for safety (no shell injection)
- Predefined transitions constants included for common state flows
