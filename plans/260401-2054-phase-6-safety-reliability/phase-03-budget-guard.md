# Phase 3: Budget Guard

**Priority**: Critical
**Status**: Complete
**Roadmap task**: #35 (budget guards — per-worker token caps, continuation limits)

## Overview

Prevent runaway costs during unattended runs. Two caps: (1) per-issue token budget — max tokens spent on a single issue before aborting, (2) continuation limit — max Claude CLI invocations per issue. Both configurable via WatchConfig.

## Context Links

- `src/commands/watch/types.ts` — `WatchConfig`, `PhaseResult`
- `src/commands/watch/phases/claude-invoker.ts` — `invokeClaude()` where token tracking hooks in
- `src/commands/watch/phases/debug-flow.ts` — retry loop is the main budget risk
- `src/commands/watch/phases/ship-flow.ts` — multi-phase pipeline

## Key Insights

- Claude CLI `--output-format json` returns token usage in metadata — but we use `text` format
- Simpler approach: track invocation count + estimate tokens from output length (1 token ~ 4 chars)
- Budget state persisted to `.ck-budget.json` per issue so it survives crashes
- Budget exceeded → label `error`, comment explaining cap hit, stop processing

## Architecture

```
BudgetGuard class:
  constructor(config: BudgetConfig)
  checkBudget(issueNum) → { allowed: boolean; reason?: string }
  recordInvocation(issueNum, result: PhaseResult) → void
  getUsage(issueNum) → { invocations: number; estimatedTokens: number }
  resetIssue(issueNum) → void

Persisted in .ck-budget.json:
{
  "issues": {
    "42": { "invocations": 5, "estimatedTokens": 12000, "lastUpdated": "..." },
    ...
  }
}
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/budget-guard.ts`

**Modify:**
- `src/commands/watch/types.ts` — add `BudgetConfig` to `WatchConfig`

## Implementation Steps

1. Add to `types.ts`:
   ```ts
   export interface BudgetConfig {
     maxInvocationsPerIssue: number;  // default: 20
     maxTokensPerIssue: number;       // default: 500_000
     enabled: boolean;                // default: true
   }
   ```

2. Create `budget-guard.ts`:

3. **`BudgetGuard` class:**
   - Constructor takes `BudgetConfig` + path to budget file (default `.ck-budget.json`)
   - `loadState()` / `saveState()` — read/write JSON file atomically (write to `.tmp`, rename)
   - `estimateTokens(output: string): number` — `Math.ceil(output.length / 4)`

4. **`checkBudget(issueNum: number): { allowed: boolean; reason?: string }`**
   - Load state, find issue entry
   - If `invocations >= maxInvocationsPerIssue` → `{ allowed: false, reason: 'invocation limit' }`
   - If `estimatedTokens >= maxTokensPerIssue` → `{ allowed: false, reason: 'token limit' }`
   - Else → `{ allowed: true }`

5. **`recordInvocation(issueNum: number, result: PhaseResult): void`**
   - Increment invocations count
   - Add `estimateTokens(result.output ?? '')` to running total
   - Update `lastUpdated` timestamp
   - Save state

6. Wire into flows: in `debug-flow.ts` and `ship-flow.ts`, before each `invokeClaudePhase()` call:
   - `const budgetCheck = budgetGuard.checkBudget(issue.number)`
   - If `!budgetCheck.allowed` → add error comment, label `error`, return early
   - After invocation: `budgetGuard.recordInvocation(issue.number, result)`

## Success Criteria

- [ ] Budget state persists to `.ck-budget.json`
- [ ] Invocation limit enforced (default 20 per issue)
- [ ] Token estimate limit enforced (default 500K per issue)
- [ ] Budget exceeded → issue labeled `error` with explanation
- [ ] State file survives process restarts
- [ ] `npm run build` compiles without errors

## Risk Assessment

- **Token estimation inaccuracy**: Output length / 4 is rough — acceptable for safety caps (overestimate is safer)
- **Stale budget files**: Issues completed months ago still tracked → could add periodic cleanup, but YAGNI for now
