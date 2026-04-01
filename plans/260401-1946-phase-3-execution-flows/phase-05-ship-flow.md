# Phase 05: Ship Flow

**Priority**: High
**Status**: Complete
**Depends on**: phase-01 (claude-invoker), phase-02 (label-manager), phase-03 (branch-manager)

---

## Overview

Port `ship-issue.sh` into TypeScript. The flow runs /plan:fast (create plan) -> /ck:cook --auto (implement from plan) -> commit -> PR. For docs/chore issues, uses `--no-test` flag to skip tests.

Ported from: `step_2_planning()`, `step_3_implementation()`, `step_4_commit()`, `step_5_pr()` in `ship-issue.sh`.

## Context Links

- Source: `auto-claude/ship-issue.sh` lines 299-452
- Invoker: `phase-01-claude-invoker.md`
- Labels: `phase-02-label-manager.md`
- Branch: `phase-03-branch-manager.md`
- Types: `src/commands/watch/types.ts` (ClassifiedIssue, PhaseResult)

## Architecture

```
executeShipFlow(classified, config)
  │
  ├── 1. createBranch(issue, issueType)
  │
  ├── 2. /plan:fast — opus, create implementation plan
  │   prompt: "/plan:fast Implement #42: <title>\n<body>"
  │
  ├── 3. /ck:cook --auto — sonnet, implement from plan
  │   prompt: "/ck:cook --auto <plan_path>"
  │   (or /ck:cook --no-test for docs/chore)
  │
  ├── 4. commitChanges + createPullRequest
  │
  ├── 5. transitionLabel(ready_for_dev -> ready_for_test)
  │
  └── 6. Return PhaseResult[]
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/ship-flow.ts`

**Read for context:**
- `src/commands/watch/phases/claude-invoker.ts` (from phase-01)
- `src/commands/watch/phases/label-manager.ts` (from phase-02)
- `src/commands/watch/phases/branch-manager.ts` (from phase-03)
- `src/commands/watch/types.ts`

## Implementation Steps

1. Create `ship-flow.ts` with main export:
   ```ts
   interface ShipFlowConfig {
     repo: string;
     autoMode: boolean;
     noTest: boolean;      // from classified.noTest (docs/chore)
   }

   export async function executeShipFlow(
     classified: ClassifiedIssue,
     config: ShipFlowConfig,
   ): Promise<PhaseResult[]>
   ```

2. Branch setup:
   - Call `createBranch(classified.issue, classified.issueType)`

3. Plan phase:
   - `invokeClaudePhase(planPrompt, 'plan', classified.modelOverride, config.autoMode)`
   - Prompt: `/plan:fast Implement GitHub issue #${num}:\n\n${title}\n\n${body}\n\nCreate implementation plan following project conventions.`
   - If plan phase fails, return early with error PhaseResult

4. Implementation phase:
   - Build cook command: `/ck:cook --auto` or `/ck:cook --no-test` based on `config.noTest`
   - `invokeClaudePhase(cookPrompt, 'fix', classified.modelOverride, config.autoMode)`
   - Phase type `fix` maps to sonnet in model-router (code execution phase)

5. Post-implementation:
   - `commitChanges(issueNum, title, issueType)`
   - `createPullRequest(repo, issueNum, title, issueType, branch)`
   - `transitionLabel(repo, issueNum, 'ready_for_dev', 'ready_for_test')`
   - `addComment(repo, issueNum, summaryMessage)`

6. Collect all PhaseResults, return array.

## Key Differences from Debug Flow

| Aspect | Debug Flow | Ship Flow |
|--------|-----------|-----------|
| First phase | /debug (analysis) | /plan:fast (planning) |
| Fix phase | /fix (apply fix) | /ck:cook --auto (implement plan) |
| Retry loop | Yes (3 cycles) | No (single pass) |
| Test phase | /test (verify) | Built into /ck:cook (unless --no-test) |
| Model (first) | opus (debug) | opus (plan) |
| Model (impl) | sonnet (fix) | sonnet (cook) |

## Todo

- [x] Create `ship-flow.ts` with executeShipFlow
- [x] Implement plan phase (/plan:fast via invoker)
- [x] Implement cook phase (/ck:cook --auto or --no-test)
- [x] Post-implementation: commit, PR, label transition
- [x] Handle noTest flag for docs/chore
- [x] Collect and return PhaseResult[]
- [x] Verify `npm run build` compiles

## Success Criteria

- [x] Plan phase runs with opus model
- [x] Implementation runs with sonnet model
- [x] `--no-test` used for docs/chore issue types
- [x] PR created with conventional commit title
- [x] Labels transitioned correctly

## Implementation Notes

- Module exports `executeShipFlow()`
- Fixed: `--auto --no-test` flags correctly passed for docs/chore issues
- Single-pass flow (no retry loop like debug-flow)
- Full PhaseResult tracking for plan and implementation phases
