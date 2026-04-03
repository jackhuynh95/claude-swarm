---
phase: 2
title: Rewrite debug-flow.ts with VividKit /ck:fix pipeline
priority: high
status: complete
effort: medium
depends_on: [phase-01]
files_modify:
  - src/commands/watch/phases/debug-flow.ts
---

# Phase 2 — Rewrite debug-flow.ts

## Context

- [debug-flow.ts](../../src/commands/watch/phases/debug-flow.ts) — current 188-line file
- [claude-invoker.ts](../../src/commands/watch/phases/claude-invoker.ts) — `invokeClaudePhase()` API
- [Roadmap](../../docs/implement-roadmap-vividkit-commands.md) — Phase 1, tasks 1-10
- **Depends on**: Phase 1 (RouteFlags extended with `ciFailure`, `hasLogs`, `quickFix`)

## Overview

Replace the 3-step `debug -> fix -> test` loop with a single `/ck:fix` call per cycle. VividKit's `/ck:fix` already includes scout, diagnose, assess, fix, verify, and prevent — no separate debug/test phases needed.

## Current Flow (remove)

```
cycle:
  1. /ck:debug (read-only analysis)     ← REMOVE
  2. /ck:fix (apply changes)            ← KEEP but change prompt
  3. build check                        ← KEEP
  4. /ck:test (verify)                  ← REMOVE (built into /ck:fix)
```

## New Flow

```
cycle:
  1. /ck:fix {flags} (single call = full pipeline)
  2. build check (with retry)
  3. success? → break
  
mid-loop: /ck:problem-solving when-stuck
post-exhaust: /ck:problem-solving when-stuck
```

## Implementation Steps

### 1. Add `buildFixFlags()` helper function

New function that maps `RouteFlags` to `/ck:fix` CLI flags. Priority order (first match wins):

```typescript
function buildFixFlags(flags: RouteFlags): string {
  if (flags.hardMode) return '--hard';
  if (flags.securityScan) return '--security';
  if (flags.ciFailure) return '--ci';
  if (flags.designReview) return '--ui';   // designReview = frontend/ui label
  if (flags.hasLogs) return '--logs';
  if (flags.quickFix) return '--quick';
  return '--auto';
}
```

### 2. Rewrite `executeDebugFlow()` main loop

Replace the debug-fix-test 3-step with single `/ck:fix` call per cycle:

```typescript
export async function executeDebugFlow(
  classified: ClassifiedIssue,
  config: DebugFlowConfig,
): Promise<PhaseResult[]> {
  const { issue } = classified;
  const results: PhaseResult[] = [];
  const cwd = config.cwd;
  const budget = createDefaultBudgetGuard(cwd);
  const history = createHistory(cwd);

  // 1. Create feature branch
  const branch = await createBranch(issue, 'bug', cwd);

  // 2. Determine fix flags from issue classification
  const fixFlag = buildFixFlags(classified.flags);

  // 3. Fix loop — single /ck:fix call per cycle
  let fixSucceeded = false;

  for (let cycle = 0; cycle < config.maxCycles; cycle++) {
    // Budget check
    const budgetCheck = budget.checkBudget(issue.number);
    if (!budgetCheck.allowed) {
      await addComment(config.repo, issue.number, `Budget exceeded: ${budgetCheck.reason}. Stopping debug flow.`);
      await transitionLabel(config.repo, issue.number, undefined, 'error');
      return results;
    }

    // Build fix prompt with failure context from previous cycle
    const lastOutput = history.getLastPhaseOutput(issue.number, 'fix');
    const failureContext = lastOutput?.output ?? '';
    const fixPrompt = buildFixPrompt(issue, fixFlag, failureContext, cycle);

    // Single /ck:fix call (includes scout+diagnose+assess+fix+verify+prevent)
    const fixResult = await invokeClaudePhase(
      fixPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
    );
    results.push(fixResult);
    budget.recordInvocation(issue.number, fixResult);
    history.recordPhaseOutput(issue.number, 'fix', fixResult);

    if (!fixResult.success) continue;

    // Build check with retry
    let buildOk = false;
    for (let buildAttempt = 0; buildAttempt < MAX_BUILD_RETRIES; buildAttempt++) {
      buildOk = await checkBuild(cwd);
      if (buildOk) break;

      if (buildAttempt < MAX_BUILD_RETRIES - 1) {
        const retryPrompt = `/ck:fix --auto Fix build errors from previous attempt. Original issue #${issue.number}: ${issue.title}`;
        const retryResult = await invokeClaudePhase(
          retryPrompt, 'fix', classified.modelOverride, config.autoMode, cwd,
        );
        results.push(retryResult);
        budget.recordInvocation(issue.number, retryResult);
        history.recordPhaseOutput(issue.number, 'fix', retryResult);
      }
    }

    if (buildOk) {
      fixSucceeded = true;
      break;
    }

    // Mid-loop problem-solving fallback (at halfway point)
    if (cycle === Math.floor(config.maxCycles / 2)) {
      const psCheck = budget.checkBudget(issue.number);
      if (psCheck.allowed) {
        const psPrompt = `/ck:problem-solving when-stuck Stuck fixing #${issue.number}: ${issue.title}. ` +
          `${config.maxCycles - cycle - 1} retries left. Last output:\n${fixResult.output ?? '(none)'}`;
        const psResult = await invokeClaudePhase(
          psPrompt, 'debug', classified.modelOverride, config.autoMode, cwd,
        );
        results.push(psResult);
        budget.recordInvocation(issue.number, psResult);
        history.recordPhaseOutput(issue.number, 'debug', psResult);
      }
    }
  }

  // 4. Post-exhaust: /ck:problem-solving if all retries failed
  if (!fixSucceeded) {
    const psCheck = budget.checkBudget(issue.number);
    if (psCheck.allowed) {
      const lastFix = history.getLastPhaseOutput(issue.number, 'fix');
      const psPrompt = `/ck:problem-solving when-stuck All ${config.maxCycles} fix cycles exhausted for #${issue.number}: ${issue.title}. ` +
        `Last output:\n${lastFix?.output ?? '(none)'}`;
      const psResult = await invokeClaudePhase(
        psPrompt, 'debug', classified.modelOverride, config.autoMode, cwd,
      );
      results.push(psResult);
      budget.recordInvocation(issue.number, psResult);
    }
  }

  // 5. Post-loop: commit, label transition
  if (fixSucceeded) {
    await commitChanges(issue.number, issue.title, 'bug', cwd);
    await transitionLabel(config.repo, issue.number, 'ready_for_dev', 'ready_for_test');
  } else {
    await transitionLabel(config.repo, issue.number, undefined, 'needs_refix');
  }

  const summary = fixSucceeded
    ? `Fix applied and build passing via \`/ck:fix ${fixFlag}\`.`
    : `Fix attempted (${config.maxCycles} cycles) with \`/ck:fix ${fixFlag}\`. Still failing. Marked needs_refix.`;

  const guard = await shouldSkipComment(config.repo, issue.number);
  if (guard.skip) {
    console.log(`[debug-flow] Skipping summary comment: ${guard.reason}`);
  } else {
    await addComment(config.repo, issue.number, summary);
  }

  return results;
}
```

### 3. Replace helper functions

**Remove**: `buildDebugPrompt()` (line 156-163) — no longer needed.

**Rewrite** `buildFixPrompt()`:

```typescript
function buildFixPrompt(
  issue: { number: number; title: string; body: string | null },
  fixFlag: string,
  failureContext: string,
  cycle: number,
): string {
  let prompt = `/ck:fix ${fixFlag} Fix #${issue.number}: ${issue.title}\n\n${issue.body ?? '(no body)'}`;
  if (cycle > 0 && failureContext) {
    prompt += `\n\n--- Previous fix attempt (cycle ${cycle}) ---\n${failureContext}`;
  }
  return prompt;
}
```

**Keep**: `didTestsPass()` — DELETE (no longer called).
**Keep**: `checkBuild()` — unchanged.

### 4. Remove PR creation from debug-flow

Per roadmap Phase 5, PR creation moves to post-ship verify gate (`/ck:ship`). Remove `createPullRequest()` call and the `prUrl` logic from `executeDebugFlow()`. The flow now stops at `commitChanges()`.

Remove `createPullRequest` from the import statement (line 6).

### 5. Summary of removals

| What | Why |
|------|-----|
| `buildDebugPrompt()` function | `/ck:fix` includes diagnosis |
| `didTestsPass()` function | No separate test phase; build check suffices |
| `/ck:debug` invocation | Built into `/ck:fix` pipeline |
| `/ck:test` invocation | Built into `/ck:fix` pipeline |
| `createPullRequest()` call + import | Moved to post-ship verify gate |
| `prUrl` variable + artifacts | No longer created here |

## Todo

- [x] Add `buildFixFlags()` helper that maps RouteFlags to /ck:fix flag string
- [x] Rewrite main loop: single `/ck:fix {flag}` per cycle, remove debug+test phases
- [x] Remove `buildDebugPrompt()`, `didTestsPass()` functions
- [x] Rewrite `buildFixPrompt()` to accept fixFlag and cycle context
- [x] Remove `createPullRequest()` import and call — stop at `commitChanges()`
- [x] Add post-exhaust `/ck:problem-solving when-stuck` fallback
- [x] Verify build passes (`npm run build`)

## Success Criteria

- `debug-flow.ts` uses single `/ck:fix` call per retry cycle
- Flag routing: hard->--hard, security->--security, ci->--ci, ui->--ui, logs->--logs, quick->--quick, default->--auto
- No `/ck:debug` or `/ck:test` invocations remain
- No `createPullRequest()` call — flow ends at commit
- `/ck:problem-solving when-stuck` fires at mid-loop AND after exhaustion
- Build passes

## Risk Assessment

- **Low risk**: `/ck:fix` is a superset of the old debug+fix+test — strictly more capable
- **Watch for**: Build check alone may be insufficient verification for some bugs. If so, future iteration can add explicit test step back. For now, `/ck:fix` includes verify step internally.
