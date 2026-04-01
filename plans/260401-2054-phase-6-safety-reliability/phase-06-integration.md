# Phase 6: Integration

**Priority**: High
**Status**: Complete
**Depends on**: Phases 1-5

## Overview

Wire all safety modules into existing flows. This phase makes no new modules — only modifies existing files to consume the 5 new utilities.

## Related Code Files

**Modify:**
- `src/commands/watch/phases/label-manager.ts` — import + use `sanitizeComment()`
- `src/commands/watch/phases/debug-flow.ts` — add comment-guard, budget-guard, conversation-history
- `src/commands/watch/phases/ship-flow.ts` — add comment-guard, budget-guard, conversation-history
- `src/commands/watch/phases/post-ship-runner.ts` — add comment-guard before slack/journal comments
- `src/commands/watch/types.ts` — add `BudgetConfig` to `WatchConfig`

## Implementation Steps

### 1. label-manager.ts — Sanitizer Integration

```ts
// At top:
import { sanitizeComment } from './comment-sanitizer.js';

// In addComment():
export async function addComment(repo, issueNum, body) {
  const sanitized = sanitizeComment(body);  // ← ADD THIS LINE
  // ... rest unchanged, use sanitized instead of body
}
```

Single line change. All callers automatically get secret stripping + truncation + disclaimer.

### 2. debug-flow.ts — Full Safety Integration

```ts
import { BudgetGuard } from './budget-guard.js';
import { ConversationHistory } from './conversation-history.js';
import { shouldSkipComment } from './comment-guard.js';

// In executeDebugFlow():
// a) Create instances
const budget = new BudgetGuard(config.budgetConfig ?? { maxInvocationsPerIssue: 20, maxTokensPerIssue: 500_000, enabled: true });
const history = new ConversationHistory();

// b) Before each invokeClaudePhase():
const budgetCheck = budget.checkBudget(issue.number);
if (!budgetCheck.allowed) {
  await addComment(repo, issue.number, `Budget exceeded: ${budgetCheck.reason}`);
  await transitionLabel(repo, issue.number, undefined, 'error');
  return results;
}

// c) After each invokeClaudePhase():
budget.recordInvocation(issue.number, result);
history.recordPhaseOutput(issue.number, 'debug', result);

// d) Replace failureContext with history:
const lastTest = history.getLastPhaseOutput(issue.number, 'test');
failureContext = lastTest?.output ?? '';

// e) Before addComment() summary:
const guard = await shouldSkipComment(repo, issue.number);
if (!guard.skip) await addComment(repo, issue.number, summary);
```

### 3. ship-flow.ts — Full Safety Integration

Same pattern as debug-flow:
- Budget check before each `invokeClaudePhase()`
- Record invocation + history after each phase
- Comment guard before summary `addComment()`

### 4. post-ship-runner.ts — Comment Guard

- Before slack-reporter and journal comments, check `shouldSkipComment()`
- Budget guard not needed here (post-ship phases are lightweight)

### 5. types.ts — Config Extension

Add optional `budgetConfig` to flow config interfaces:

```ts
// In WatchConfig or a shared SafetyConfig:
export interface SafetyConfig {
  budget: BudgetConfig;
  costTracking: boolean;
  historyPath?: string;   // default .ck-history.json
  budgetPath?: string;    // default .ck-budget.json
  costPath?: string;      // default .ck-costs.json
}
```

### 6. Build Verification

- Run `npm run build` — verify zero errors
- All new imports resolve correctly
- No circular dependencies (safety modules import nothing from flows)

## Success Criteria

- [ ] `addComment()` auto-sanitizes all output (secrets stripped, truncated, disclaimer added)
- [ ] debug-flow enforces budget + records history + guards comments
- [ ] ship-flow enforces budget + records history + guards comments
- [ ] post-ship-runner guards comments
- [ ] types.ts has SafetyConfig/BudgetConfig
- [ ] `npm run build` compiles without errors
- [ ] No circular dependency between safety modules and flow modules

## Risk Assessment

- **Integration ordering**: Sanitizer in label-manager means ALL comments are sanitized even from post-ship — this is intentional and correct
- **Budget guard false positives**: Default 20 invocations is generous; can be overridden per-config
