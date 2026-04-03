---
phase: 2
title: Upgrade ship-flow.ts to VividKit recipe
status: completed
completed: 2026-04-03
priority: high
effort: medium
---

# Phase 2 — Upgrade ship-flow.ts

## Overview

Rewrite ship-flow to use VividKit's full recipe: optional brainstorm, conditional red-team, plan validate, scout, code-review. **Remove PR creation entirely** — ship-flow ends at `commitChanges()`.

## Files to Modify

- `src/commands/watch/phases/ship-flow.ts`

## Files to Read (context)

- `src/commands/watch/types.ts` — RouteFlags, ClassifiedIssue
- `src/commands/watch/phases/branch-manager.ts` — commitChanges (keep using), createPullRequest (STOP using)
- `src/commands/watch/phases/claude-invoker.ts` — invokeClaudePhase signature

## Key Decisions

- **DO NOT touch** `branch-manager.ts` — `createPullRequest()` stays as-is for post-ship fallback
- **Remove** all `/ck:ship` calls from ship-flow — moved to post-ship verify gate
- **Remove** `createPullRequest()` call from ship-flow
- **Remove** `extractPrUrl()` — no longer needed in ship-flow
- **Remove** `useTeam` and `targetBranch` from `ShipFlowConfig` — team/ship logic moves to post-ship
- Ship-flow returns results ending at commit, no PR artifacts

## Implementation Steps

### 1. Simplify `ShipFlowConfig`

Remove `useTeam` and `targetBranch` — these belong in post-ship now:

```typescript
export interface ShipFlowConfig {
  repo: string;
  autoMode: boolean;
  noTest: boolean;
  vaultPath?: string;
  cwd?: string;
}
```

### 2. Add vague spec detection helper

```typescript
function isVagueSpec(issue: { body: string | null }): boolean {
  const body = issue.body ?? '';
  if (body.length < 100) return true;
  // Check for acceptance criteria markers
  const hasCriteria = /accept|criteria|require|must|should|expect|given|when|then/i.test(body);
  return !hasCriteria;
}
```

### 3. Rewrite `executeShipFlow` — new pipeline

The new flow order (replace lines 24-134):

```
1. createBranch()
2. Budget check
3. Vault context load
4. [OPTIONAL] /ck:brainstorm — if isVagueSpec(issue)
5. Plan phase:
   - hardMode → /ck:plan --hard
   - default  → /ck:plan --fast
6. [CONDITIONAL] /ck:plan red-team — ONLY if hardMode
7. [CONDITIONAL] /ck:plan validate — ONLY if hardMode
8. Fail-check on plan result
9. Budget check (pre-cook)
10. /ck:cook --auto (or --auto --no-test for docs/chore)
11. /ck:scout — edge case discovery
12. /ck:code-review — quality check
13. commitChanges() ← STOP HERE
14. Label transition: ready_for_dev → ready_for_test
15. Summary comment (no PR URL)
```

### 4. Detailed code for each new step

**Step 4 — Brainstorm (optional):**
```typescript
if (isVagueSpec(issue)) {
  const brainstormPrompt = `/ck:brainstorm Clarify scope for #${issue.number}: ${issue.title}\n\n${issue.body ?? ''}`;
  const brainstormResult = await invokeClaudePhase(
    brainstormPrompt, 'brainstorm', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(brainstormResult);
  budget.recordInvocation(issue.number, brainstormResult);
  history.recordPhaseOutput(issue.number, 'brainstorm', brainstormResult);
}
```

**Step 5 — Plan (conditional flag):**
```typescript
const planFlag = classified.flags.hardMode ? '--hard' : '--fast';
const planPrompt = buildPlanPrompt(issue, vaultContext, planFlag);
const planResult = await invokeClaudePhase(
  planPrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
);
results.push(planResult);
budget.recordInvocation(issue.number, planResult);
history.recordPhaseOutput(issue.number, 'plan', planResult);
```

**Step 6 — Red-team (only if hard):**
```typescript
if (classified.flags.hardMode) {
  const redTeamPrompt = `/ck:plan red-team Review plan for #${issue.number}: ${issue.title}. Think like an attacker — find gaps, missing edge cases, security oversights.`;
  const redTeamResult = await invokeClaudePhase(
    redTeamPrompt, 'plan_redteam', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(redTeamResult);
  budget.recordInvocation(issue.number, redTeamResult);
  history.recordPhaseOutput(issue.number, 'plan_redteam', redTeamResult);
}
```

**Step 7 — Validate (only if hard):**
```typescript
if (classified.flags.hardMode) {
  const validatePrompt = `/ck:plan validate Validate plan for #${issue.number}: ${issue.title}. Check for completeness, feasibility, and alignment with project conventions.`;
  const validateResult = await invokeClaudePhase(
    validatePrompt, 'plan', classified.modelOverride, config.autoMode, cwd,
  );
  results.push(validateResult);
  budget.recordInvocation(issue.number, validateResult);
  history.recordPhaseOutput(issue.number, 'plan', validateResult);
}
```

**Steps 11-12 — Scout + Code Review (after cook):**
```typescript
// Scout for edge cases
const scoutPrompt = `/ck:scout Scan implementation for #${issue.number}: ${issue.title}. Find edge cases, missing validations, untested paths.`;
const scoutResult = await invokeClaudePhase(
  scoutPrompt, 'scout', classified.modelOverride, config.autoMode, cwd,
);
results.push(scoutResult);
budget.recordInvocation(issue.number, scoutResult);

// Code review
const reviewPrompt = `/ck:code-review Review implementation for #${issue.number}: ${issue.title}. Check quality, patterns, maintainability.`;
const reviewResult = await invokeClaudePhase(
  reviewPrompt, 'code_review', classified.modelOverride, config.autoMode, cwd,
);
results.push(reviewResult);
budget.recordInvocation(issue.number, reviewResult);
```

**Step 13 — Commit (FINAL step, no PR):**
```typescript
const committed = await commitChanges(issue.number, issue.title, issueType, cwd);
```

### 5. Update `buildPlanPrompt` — accept plan flag

```typescript
function buildPlanPrompt(
  issue: { number: number; title: string; body: string | null },
  vaultContext: string,
  planFlag: string,
): string {
  const contextSection = vaultContext ? `\n\n${vaultContext}\n` : '';
  return `/ck:plan ${planFlag} Implement GitHub issue #${issue.number}:\n\n${issue.title}\n\n${issue.body ?? ''}${contextSection}\nCreate implementation plan following project conventions.`;
}
```

### 6. Remove dead code

- Delete `buildTeamPlanPrompt()` — team logic moves to post-ship
- Delete `extractPrUrl()` — no PR in ship-flow
- Remove `createPullRequest` import from branch-manager
- Remove `useTeam` / `targetBranch` references

### 7. Update summary comment

```typescript
const summary = committed
  ? `Implementation complete for #${issue.number}. Awaiting post-ship verification.`
  : `No changes detected for #${issue.number}.`;
```

## What NOT to Change

- `branch-manager.ts` — `createPullRequest()` stays untouched (fallback for post-ship)
- `post-ship-runner.ts` — will be upgraded in Phase 5 (separate plan)
- `watch-command.ts` — no changes needed, it already calls ship-flow then post-ship

## Success Criteria

- [x] Ship-flow does NOT call `createPullRequest()`
- [x] Ship-flow does NOT call `/ck:ship`
- [x] Ship-flow ends at `commitChanges()`
- [x] Brainstorm runs only when spec is vague
- [x] Red-team + validate run only for `hardMode` issues
- [x] Scout + code-review run after cook
- [x] `ShipFlowConfig` no longer has `useTeam` or `targetBranch`
- [x] `branch-manager.ts` is NOT modified
- [x] TypeScript compiles without errors

## Call Sites to Update (remove useTeam/targetBranch)

- `src/commands/watch/watch-command.ts:128` — passes `useTeam: options.useTeam` to ShipFlowConfig. Remove.
- `src/commands/watch/watch-command.ts:63,91` — `useTeam` in options type. Keep in CLI options (may be used by post-ship later), just stop passing to ship-flow.
- `src/config-resolver.ts:15` — `useTeam` field. Keep (used elsewhere), just no longer passed to ship-flow.

## Risk Assessment

- **Low risk**: Ship-flow changes are self-contained. Post-ship still uses `createPullRequest` independently via branch-manager.
- **Call site cleanup**: Only `watch-command.ts:128` needs editing — remove `useTeam` and `targetBranch` from the ShipFlowConfig object literal.
