# Phase 04: Debug Flow

**Priority**: High
**Status**: Complete
**Depends on**: phase-01 (claude-invoker), phase-02 (label-manager), phase-03 (branch-manager)

---

## Overview

Port `fix-issue.sh` debug loop into TypeScript. The flow runs /debug (root cause analysis) -> /fix (apply solution) -> /test (verify), retrying up to 3 cycles on test failure. Each cycle feeds test failure context back into the next debug phase.

Ported from: `step_2_fix_loop()` in `fix-issue.sh:430-495`.

## Context Links

- Source: `auto-claude/fix-issue.sh` lines 324-495 (debug/fix/test + loop)
- Invoker: `phase-01-claude-invoker.md`
- Labels: `phase-02-label-manager.md`
- Branch: `phase-03-branch-manager.md`
- Types: `src/commands/watch/types.ts` (ClassifiedIssue, PhaseResult, IssueState)
- Model router: `src/commands/watch/phases/model-router.ts`

## Architecture

```
executeDebugFlow(classified, config)
  │
  ├── 1. createBranch(issue, 'bug')
  │
  ├── 2. Loop (max 3 cycles):
  │   │
  │   ├── /debug — opus, read-only analysis
  │   │   prompt: "Investigate root cause of #42: <title>\n<body>"
  │   │   → store debugAnalysis
  │   │
  │   ├── /fix — sonnet, apply changes
  │   │   prompt: "/fix Fix based on debug analysis:\n<issue>\n<debugAnalysis>"
  │   │   → check build (npm run build)
  │   │   → retry within fix phase up to 3 attempts if build errors
  │   │
  │   └── /test — sonnet, verify
  │       prompt: "/test Verify fix for #42: <title>"
  │       → if pass: break loop
  │       → if fail: append failure context, next cycle
  │
  ├── 3. commitChanges + createPullRequest
  │
  ├── 4. transitionLabel(ready_for_dev -> ready_for_test)
  │
  └── 5. Return PhaseResult[]
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/debug-flow.ts`

**Read for context:**
- `src/commands/watch/phases/claude-invoker.ts` (from phase-01)
- `src/commands/watch/phases/label-manager.ts` (from phase-02)
- `src/commands/watch/phases/branch-manager.ts` (from phase-03)
- `src/commands/watch/types.ts`

## Implementation Steps

1. Create `debug-flow.ts` with main export:
   ```ts
   interface DebugFlowConfig {
     repo: string;
     maxCycles: number;    // default 3
     autoMode: boolean;
   }

   export async function executeDebugFlow(
     classified: ClassifiedIssue,
     config: DebugFlowConfig,
   ): Promise<PhaseResult[]>
   ```

2. Branch setup:
   - Call `createBranch(classified.issue, classified.issueType)`

3. Debug-Fix-Test loop (max `config.maxCycles`):
   - **Debug phase**: `invokeClaudePhase(debugPrompt, 'debug', classified.modelOverride, config.autoMode)`
     - Prompt: investigation only, no fix implementation
     - Store output as `debugAnalysis`
   - **Fix phase**: `invokeClaudePhase(fixPrompt, 'fix', classified.modelOverride, config.autoMode)`
     - Include issue body + debug analysis in prompt
     - After fix: run build check (`execFile('npm', ['run', 'build'])`)
     - If build errors: retry fix up to 3 times with error context
   - **Test phase**: `invokeClaudePhase(testPrompt, 'test', undefined, config.autoMode)`
     - Parse output for pass/fail indicators
     - If pass: break loop, success
     - If fail: append failure to context for next cycle

4. Post-loop:
   - `commitChanges(issueNum, title, 'bug')`
   - `createPullRequest(repo, issueNum, title, 'bug', branch)`
   - `transitionLabel(repo, issueNum, 'ready_for_dev', 'ready_for_test')`
   - `addComment(repo, issueNum, summaryMessage)`

5. Collect all PhaseResults from each invocation, return array.

## Test result parsing

Simple heuristic (from fix-issue.sh:417-428):
```ts
function didTestsPass(output: string): boolean {
  const lower = output.toLowerCase();
  if (/all.*pass|tests.*pass|0 failed/.test(lower)) return true;
  if (/fail|error/.test(lower)) return false;
  return true; // inconclusive = proceed
}
```

## Todo

- [x] Create `debug-flow.ts` with executeDebugFlow
- [x] Implement debug -> fix -> test loop with retry
- [x] Build check after fix phase
- [x] Test result parsing (pass/fail heuristic)
- [x] Post-loop: commit, PR, label transition
- [x] Collect and return PhaseResult[]
- [x] Verify `npm run build` compiles

## Success Criteria

- [x] 3-cycle retry loop executes correctly
- [x] Debug analysis feeds into fix prompt
- [x] Test failures feed into next cycle's context
- [x] Build errors trigger fix retry (inner loop)
- [x] PR created on completion
- [x] Labels transitioned

## Risk Assessment

- **All cycles fail**: Flow returns PhaseResults with last test failure. Watcher can transition to `needs_refix` state.
- **Build errors persist**: Inner fix retry caps at 3. If still broken, test phase catches it.

## Implementation Notes

- Module exports `executeDebugFlow()`
- Fixed: Inconclusive test results now fail (not proceed) per spec
- Fixed: No PR created if all tests fail (maintains state for refix)
- Full PhaseResult tracking for all three phases (debug, fix, test)
