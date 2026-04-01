# Phase 1: Verifier

**Priority**: Critical
**Status**: Complete
**File**: `src/commands/watch/phases/verifier.ts`

---

## Overview

Independent verify agent that reviews implementation changes and returns a PASS/FAIL/PARTIAL verdict. Runs AFTER debug-flow/ship-flow completes. Blocks downstream post-ship phases on FAIL.

## Context Links

- Types: `src/commands/watch/types.ts` (PhaseResult, ClassifiedIssue, PhaseType='verify')
- Model config: `src/commands/watch/phases/model-router.ts` (verify: sonnet, 180s, 3 turns)
- Invoker: `src/commands/watch/phases/claude-invoker.ts` (invokeClaudePhase)
- Labels: `src/commands/watch/phases/label-manager.ts` (TRANSITIONS.verified, .needsRefix)
- Pattern: `src/commands/watch/phases/ship-flow.ts` (reference implementation pattern)

## Key Insights

- Verifier must be INDEPENDENT — it does NOT see debug/ship flow output. Fresh Claude session reviews the diff.
- Uses `git diff main...HEAD` to see what changed, not flow artifacts.
- Verdict is a structured response: `PASS`, `FAIL`, or `PARTIAL` with reasoning.
- PARTIAL means "works but has concerns" — continues pipeline but flags issues.

## Architecture

```
Input: ClassifiedIssue + VerifierConfig (repo, branch, cwd)
  │
  ├─ 1. Get git diff (main...HEAD) via prompt instruction
  ├─ 2. Read issue body for requirements context
  ├─ 3. Claude reviews: does diff satisfy issue requirements?
  ├─ 4. Parse verdict from output (PASS/FAIL/PARTIAL)
  │
  ├─ PASS → transitionLabel(shipped → verified), comment verdict
  ├─ PARTIAL → transitionLabel(shipped → verified), comment with concerns
  └─ FAIL → transitionLabel(shipped → needs_refix), comment failure reasons
```

## Related Code Files

**Modify**: None (new file only)
**Create**: `src/commands/watch/phases/verifier.ts`
**Read**: `types.ts`, `claude-invoker.ts`, `label-manager.ts`

## Implementation Steps

1. Create `verifier.ts` with exports: `VerifierConfig` interface, `VerifyVerdict` type, `executeVerify()` function
2. Define `VerifierConfig`:
   ```typescript
   export interface VerifierConfig {
     repo: string;
     autoMode: boolean;
     branch: string;  // feature branch to verify
     cwd?: string;
   }
   export type VerifyVerdict = 'PASS' | 'FAIL' | 'PARTIAL';
   export interface VerifyResult {
     verdict: VerifyVerdict;
     reasoning: string;
     phaseResult: PhaseResult;
   }
   ```
3. Build verify prompt:
   ```
   You are an independent code reviewer. Review the changes on this branch.
   
   Issue #{number}: {title}
   Requirements: {body}
   
   Run `git diff main...HEAD` to see changes.
   
   Evaluate:
   1. Do changes satisfy the issue requirements?
   2. Are there obvious bugs or regressions?
   3. Is the code quality acceptable?
   
   Reply with EXACTLY one of:
   VERDICT: PASS — [one-line reason]
   VERDICT: PARTIAL — [concerns]
   VERDICT: FAIL — [failure reasons]
   ```
4. Invoke via `invokeClaudePhase(prompt, 'verify', modelOverride, autoMode, cwd)`
5. Parse verdict from output using regex: `/VERDICT:\s*(PASS|FAIL|PARTIAL)\s*[—-]\s*(.+)/i`
6. Default to PARTIAL if parsing fails (don't block on parse errors)
7. Post verdict as GitHub comment with `<!-- claude-swarm:verify -->` marker
8. Transition labels based on verdict:
   - PASS/PARTIAL: `transitionLabel(repo, issueNum, 'shipped', 'verified')`
   - FAIL: `transitionLabel(repo, issueNum, 'shipped', 'needs_refix')`
9. Return `VerifyResult` with verdict, reasoning, and PhaseResult

## Todo

- [x] Create verifier.ts file
- [x] Export VerifierConfig, VerifyVerdict, VerifyResult types
- [x] Implement executeVerify() following ship-flow pattern
- [x] Build verify prompt with git diff + issue context
- [x] Parse VERDICT line from Claude output
- [x] Post verdict comment with bot marker
- [x] Transition labels (verified or needs_refix)
- [x] Verify `npm run build` compiles

## Success Criteria

- Returns structured VerifyResult with PASS/FAIL/PARTIAL
- FAIL blocks downstream post-ship phases
- GitHub comment posted with verdict and reasoning
- Label transition correct for each verdict
- Independent — no knowledge of prior flow execution

## Risk Assessment

- **Verdict parsing**: Claude might not follow exact format → fallback to PARTIAL
- **Empty diff**: Branch might have no changes → detect and return FAIL with "no changes"
- **Timeout**: 180s should be enough for diff review, but large PRs might need more
