---
phase: 1
title: Verify + Ship Gate Implementation
status: complete
files:
  modify:
    - src/commands/watch/types.ts
    - src/commands/watch/phases/model-router.ts
    - src/commands/watch/phases/post-ship-runner.ts
  no_touch:
    - src/commands/watch/phases/branch-manager.ts
    - src/commands/watch/phases/verifier.ts
---

# Phase 1: Verify + Ship Gate Implementation

## Overview

Replace the current verify-first post-ship pipeline with `/ck:ship --official` as the primary verify + PR path. Add `/ck:scout` and `/ck:predict` before shipping. Fallback to `branch-manager.ts` `createPullRequest()` if `/ck:ship` fails.

## Context

**Current `post-ship-runner.ts` pipeline:**
1. `executeVerify()` → 2-pass review → FAIL stops pipeline
2. `executeSecurityFlow()` → red testing (advisory)
3. `executeE2e()` → E2E tests → FAIL stops pipeline
4. `executeDesignReview()` → advisory
5. `executeSlackReport()` → advisory
6. `executeJournal()` → advisory
7. `/ck:llms` → docs generation
8. `recordRun()` → file write

**Key insight:** `/ck:ship --official` already includes test + 2-pass review (standard + red-team) + version bump + changelog + push + PR. So it replaces both `executeVerify()` AND the separate `createPullRequest()` call that happens after post-ship in `watch-command.ts`.

## Step 1: Add PhaseTypes to types.ts

Add `'ship'` and `'predict'` to the `PhaseType` union:

```typescript
// In types.ts, update PhaseType union
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'security_review' | 'security_stride'
  | 'scout' | 'code_review'
  | 'scenario' | 'ui_test'
  | 'ship' | 'predict'                    // ← ADD these two
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';
```

## Step 2: Add Phase Configs to model-router.ts

Add `ship` and `predict` entries to `PHASE_CONFIGS`:

```typescript
// After existing entries in PHASE_CONFIGS
ship:     { model: 'sonnet', effort: 'medium', maxTurns: 5, timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
predict:  { model: 'opus',   effort: 'high',   maxTurns: 5, timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
```

## Step 3: Rewrite post-ship-runner.ts

### New PostShipConfig

Add `shipMode` boolean and accept `branch` info for PR creation fallback:

```typescript
export interface PostShipConfig {
  repo: string;
  autoMode: boolean;
  branch: string;
  baseUrl?: string;
  e2eScenarios?: string[];
  vaultPath: string;
  cwd?: string;
  redTeam?: boolean;
}

export interface PostShipResult {
  results: PhaseResult[];
  verdict: 'PASS' | 'FAIL';    // simplified: ship succeeded or both paths failed
  pipelinePassed: boolean;
  shipPath: 'ck-ship' | 'fallback' | 'none';  // which path was used
}
```

### New Pipeline Logic

```
executePostShip():
  │
  ├── 1. Security flow (if securityScan flag) — advisory, never blocks
  │
  ├── 2. E2E tests (if baseUrl) — FAIL stops pipeline
  │
  ├── 3. /ck:scout — edge case discovery (always runs)
  │
  ├── 4. /ck:predict — 5-persona impact debate (only if hardMode)
  │
  ├── 5. TRY: /ck:ship --official
  │   ├── Build prompt with issue context + branch info
  │   ├── Invoke via invokeClaudePhase('ship')
  │   ├── Parse output for PR URL
  │   ├── SUCCESS → verdict=PASS, shipPath='ck-ship'
  │   └── FAIL → go to step 6
  │
  ├── 6. FALLBACK: createPullRequest() from branch-manager.ts
  │   ├── SUCCESS → verdict=PASS, shipPath='fallback'
  │   └── FAIL → verdict=FAIL, shipPath='none'
  │
  ├── 7. Design review — advisory
  ├── 8. Slack report
  ├── 9. Journal
  ├── 10. /ck:llms docs
  └── 11. recordRun()
```

### Implementation Details

**Remove:** `executeVerify()` call — `/ck:ship` includes review.

**Keep:** All advisory phases (design-review, slack-report, journal, llms, run-recorder).

**New imports:**
```typescript
import { createPullRequest } from './branch-manager.js';
```

**Scout prompt:**
```typescript
function buildScoutPrompt(issue): string {
  return `/ck:scout Discover edge cases in changes for #${issue.number}: ${issue.title}

Run \`git diff main...HEAD\` to see changes.
Look for: missing error handling, untested paths, boundary conditions, race conditions.`;
}
```

**Predict prompt (only for hardMode):**
```typescript
function buildPredictPrompt(issue): string {
  return `/ck:predict Analyze impact of changes for #${issue.number}: ${issue.title}

5 expert personas debate: architect, security engineer, performance engineer, UX designer, ops/SRE.
Each persona evaluates the changes and flags concerns from their perspective.`;
}
```

**Ship prompt:**
```typescript
function buildShipPrompt(issue, branch, repo): string {
  return `/ck:ship --official Ship changes for #${issue.number}: ${issue.title}

Branch: ${branch}
Repository: ${repo}

Pipeline:
1. Merge latest main
2. Run test suite
3. 2-pass code review (standard + red-team)
4. Bump version + update changelog
5. Push branch
6. Create PR closing #${issue.number}`;
}
```

**Ship result parsing:**
```typescript
const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

function parseShipResult(output: string): { success: boolean; prUrl?: string } {
  const prMatch = output.match(PR_URL_PATTERN);
  return {
    success: prMatch !== null,
    prUrl: prMatch?.[0],
  };
}
```

**Logging which path was used:**
```typescript
console.log(`[post-ship] shipped via ${shipPath}`);
// Also include in PhaseResult artifacts array
```

## Step 4: Update PostShipResult Usage

The `PostShipResult.verdict` type changes from `VerifyVerdict` ('PASS' | 'FAIL' | 'PARTIAL') to simple `'PASS' | 'FAIL'`. Check callers:

- `watch-command.ts` — uses `result.verdict` and `result.pipelinePassed`. The new `shipPath` field is additive. Verdict simplification (no PARTIAL) means any code checking for PARTIAL should be updated to treat it as PASS.

## DO NOT MODIFY

- **`branch-manager.ts`** — `createPullRequest()` is fallback safety net. Zero changes.
- **`verifier.ts`** — Still importable. Just not called in main post-ship path.

## Todo

- [x] Add `'ship'` and `'predict'` to PhaseType in types.ts
- [x] Add `ship` and `predict` configs to model-router.ts PHASE_CONFIGS
- [x] Remove `executeVerify` import and call from post-ship-runner.ts
- [x] Add `createPullRequest` import from branch-manager.ts
- [x] Add `buildScoutPrompt()` function
- [x] Add `buildPredictPrompt()` function
- [x] Add `buildShipPrompt()` function
- [x] Add `parseShipResult()` function
- [x] Rewrite `executePostShip()` with new pipeline: security → e2e → scout → predict → ship → fallback
- [x] Update `PostShipResult` type with `shipPath` field and simplified verdict
- [x] Add logging for which ship path was used
- [x] Run `npm run build` to verify compilation

## Risk Assessment

- **Low risk**: types.ts and model-router.ts changes are additive (new union members, new config entries)
- **Medium risk**: post-ship-runner.ts rewrite — mitigated by keeping `createPullRequest()` fallback
- **Rollback**: If `/ck:ship` consistently fails, the fallback path IS the old behavior (just missing the verify step)

## Security Considerations

- `/ck:ship --official` runs with `--dangerously-skip-permissions` in autoMode (same as all other phases)
- PR creation fallback uses `gh pr create` via `execFile` (already safe, no shell injection)
- No new credentials or secrets needed
