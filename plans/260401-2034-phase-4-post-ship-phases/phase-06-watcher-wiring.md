# Phase 6: Watcher Wiring

**Priority**: Critical
**Status**: Complete
**Files**: `src/commands/watch/phases/post-ship-runner.ts`, `src/commands/watch/types.ts`, `src/commands/watch/phases/model-router.ts`

---

## Overview

Wire all 5 post-ship modules into the watcher lifecycle via a single orchestrator: `post-ship-runner.ts`. This module sequences verify → e2e → design-review → slack-report → journal, with fail-fast on verify/e2e failures.

## Context Links

- Watch command: `src/commands/watch/watch-command.ts` (currently a placeholder)
- Types: `src/commands/watch/types.ts` (PhaseType, IssueState)
- Model router: `src/commands/watch/phases/model-router.ts` (getFlowPhases)
- Debug flow: `src/commands/watch/phases/debug-flow.ts` (returns PhaseResult[])
- Ship flow: `src/commands/watch/phases/ship-flow.ts` (returns PhaseResult[])

## Key Insights

- Post-ship is a SEPARATE orchestration layer, not part of debug/ship flows
- Fail-fast: verifier FAIL or e2e FAIL stops the pipeline immediately
- Design review and slack report never block
- Journal always runs last (even if earlier phases had non-blocking failures)
- `post-ship-runner.ts` is the single entry point — watch-command calls it after flow completion

## Architecture

```
watch-command.ts (future)
  │
  ├─ classifyIssue()
  ├─ executeDebugFlow() or executeShipFlow()
  │     └─ returns PhaseResult[]
  │
  └─ executePostShip(classified, postShipConfig, flowResults)
        │
        ├─ 1. verifier.ts → executeVerify()
        │     └─ FAIL? → stop, return results
        │
        ├─ 2. e2e-runner.ts → executeE2e()
        │     └─ FAIL? → stop, return results
        │
        ├─ 3. design-reviewer.ts → executeDesignReview()
        │     └─ (never blocks)
        │
        ├─ 4. slack-reporter.ts → executeSlackReport()
        │     └─ (never blocks)
        │
        └─ 5. journal-writer.ts → executeJournal()
              └─ (never blocks)
```

## Related Code Files

**Modify**:
- `src/commands/watch/types.ts` — add 'design_review' to PhaseType
- `src/commands/watch/phases/model-router.ts` — add design_review config

**Create**: `src/commands/watch/phases/post-ship-runner.ts`

## Implementation Steps

### Step 1: Type Changes

In `types.ts`, add `'design_review'` to PhaseType union:
```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';
```

### Step 2: Model Router Config

In `model-router.ts`, add to PHASE_CONFIGS:
```typescript
design_review: { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
```

### Step 3: Post-Ship Runner

Create `post-ship-runner.ts`:

```typescript
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { executeVerify, type VerifierConfig, type VerifyVerdict } from './verifier.js';
import { executeE2e, type E2eConfig } from './e2e-runner.js';
import { executeDesignReview, type DesignReviewConfig } from './design-reviewer.js';
import { executeSlackReport, type SlackReporterConfig } from './slack-reporter.js';
import { executeJournal, type JournalConfig } from './journal-writer.js';

export interface PostShipConfig {
  repo: string;
  autoMode: boolean;
  branch: string;
  baseUrl?: string;           // E2E base URL (undefined = skip E2E)
  e2eScenarios?: string[];
  vaultPath: string;          // obsidian-vault path
  cwd?: string;
}

export interface PostShipResult {
  results: PhaseResult[];
  verdict: VerifyVerdict;     // from verifier
  pipelinePassed: boolean;    // false if verify/e2e failed
}
```

Key function signature:
```typescript
export async function executePostShip(
  classified: ClassifiedIssue,
  config: PostShipConfig,
  flowResults: PhaseResult[],
): Promise<PostShipResult>
```

Implementation logic:
1. Run `executeVerify()` → get verdict
2. If FAIL → return early with pipelinePassed=false
3. Run `executeE2e()` → if not skipped and FAIL → return early
4. Run `executeDesignReview()` if flags.designReview (fire-and-forget, push result)
5. Run `executeSlackReport()` (fire-and-forget, push result)
6. Run `executeJournal()` (fire-and-forget, push result)
7. Return PostShipResult with all results + final verdict

### Step 4: Integrate with Watch Command

When watch-command is fully implemented (Phase 8), the dispatch function will call:
```typescript
// After flow completes successfully
const flowResults = await executeDebugFlow(classified, debugConfig);
// or
const flowResults = await executeShipFlow(classified, shipConfig);

// Run post-ship pipeline
const postShipResult = await executePostShip(classified, postShipConfig, flowResults);

if (!postShipResult.pipelinePassed) {
  // Verifier or E2E failed — issue needs refix
  console.log(`Post-ship failed for #${classified.issue.number}: ${postShipResult.verdict}`);
}
```

For now, `post-ship-runner.ts` is a standalone module ready to be called. Watch-command wiring is deferred to when the full daemon loop is implemented.

## Todo

- [x] Add 'design_review' to PhaseType in types.ts
- [x] Add design_review config in model-router.ts
- [x] Create post-ship-runner.ts
- [x] Export PostShipConfig, PostShipResult types
- [x] Implement executePostShip() with fail-fast logic
- [x] Wire verify → e2e → design-review → slack → journal sequence
- [x] Handle partial failures (non-blocking phases)
- [x] Verify `npm run build` compiles

## Success Criteria

- Single entry point `executePostShip()` orchestrates all 5 phases
- Verify/E2E FAIL stops pipeline (fail-fast)
- Design review, Slack, Journal never block
- Journal always runs (even after non-blocking failures)
- New 'design_review' PhaseType compiles in types + model-router
- Clean module boundaries — each phase is independently testable

## Risk Assessment

- **Phase ordering**: If verifier is flaky → too many false FAILs blocking pipeline. Mitigation: PARTIAL verdict allows continuation.
- **watch-command not ready**: post-ship-runner.ts is standalone — can be tested independently before full daemon wiring.
