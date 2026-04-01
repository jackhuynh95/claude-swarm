# Phase 2: E2E Runner

**Priority**: High
**Status**: Complete
**File**: `src/commands/watch/phases/e2e-runner.ts`

---

## Overview

Agent-browser E2E testing phase. Invokes `agent-browser` CLI to run browser-based verification after implementation. Skipped when no E2E config exists for the repo.

## Context Links

- Types: `src/commands/watch/types.ts` (PhaseType='e2e', PhaseResult)
- Model config: `src/commands/watch/phases/model-router.ts` (e2e: sonnet, 180s, 3 turns, Bash only)
- Invoker: `src/commands/watch/phases/claude-invoker.ts`
- Labels: `src/commands/watch/phases/label-manager.ts`
- Pattern: `src/commands/watch/phases/debug-flow.ts` (test detection heuristic)

## Key Insights

- `agent-browser` is a CLI tool that automates browser interactions via CDP
- E2E is optional — only runs if repo has E2E config (test URLs, scenarios)
- Uses 'e2e' PhaseType which is Bash-only (tools: ['Bash']) — Claude drives agent-browser via shell
- Test pass/fail detection reuses same heuristic as debug-flow's test phase

## Architecture

```
Input: ClassifiedIssue + E2eConfig (repo, baseUrl, scenarios, cwd)
  │
  ├─ 1. Check if E2E config exists (baseUrl required)
  │     └─ No config → skip, return success with "skipped" note
  │
  ├─ 2. Build prompt instructing Claude to run agent-browser
  │     - Base URL to test against
  │     - Scenarios from issue context or config
  │
  ├─ 3. Invoke via 'e2e' phase (sonnet, Bash only, 180s)
  │
  ├─ 4. Parse results: pass/fail heuristic on output
  │
  ├─ PASS → comment results, continue pipeline
  └─ FAIL → transitionLabel(needs_refix), comment failures, stop pipeline
```

## Related Code Files

**Modify**: None
**Create**: `src/commands/watch/phases/e2e-runner.ts`
**Read**: `types.ts`, `claude-invoker.ts`, `label-manager.ts`, `debug-flow.ts` (test heuristic)

## Implementation Steps

1. Create `e2e-runner.ts` with exports:
   ```typescript
   export interface E2eConfig {
     repo: string;
     autoMode: boolean;
     baseUrl?: string;       // app URL to test (undefined = skip)
     scenarios?: string[];   // specific test scenarios
     cwd?: string;
   }
   export interface E2eResult {
     skipped: boolean;
     passed: boolean;
     phaseResult: PhaseResult;
   }
   ```
2. Implement `executeE2e(classified, config)`:
   - If no `baseUrl` → return skipped result (success=true, skipped=true)
   - Build prompt:
     ```
     Run E2E browser tests for issue #{number}: {title}
     
     Base URL: {baseUrl}
     {scenarios if provided}
     
     Use `agent-browser` CLI to:
     1. Navigate to the base URL
     2. Verify the implemented feature works
     3. Check for visual regressions or broken interactions
     
     Report results as:
     E2E_RESULT: PASS — [summary]
     or
     E2E_RESULT: FAIL — [what failed]
     ```
3. Invoke via `invokeClaudePhase(prompt, 'e2e', modelOverride, autoMode, cwd)`
4. Parse E2E_RESULT from output: `/E2E_RESULT:\s*(PASS|FAIL)\s*[—-]\s*(.+)/i`
5. Fallback: if no structured result, use pass/fail heuristic from debug-flow:
   - Pass: `/all.*pass|tests.*pass|0 failed|no.*error/i`
   - Fail: `/fail|error|crash|timeout/i`
6. Post results as comment with `<!-- claude-swarm:e2e -->` marker
7. On FAIL: `transitionLabel(repo, issueNum, undefined, 'needs_refix')`
8. Return E2eResult

## Todo

- [x] Create e2e-runner.ts file
- [x] Export E2eConfig, E2eResult types
- [x] Implement executeE2e() with skip-if-no-config logic
- [x] Build agent-browser prompt with baseUrl + scenarios
- [x] Parse E2E_RESULT with regex fallback
- [x] Post results comment with bot marker
- [x] Handle FAIL with label transition
- [x] Verify `npm run build` compiles

## Success Criteria

- Gracefully skips when no baseUrl configured
- Invokes agent-browser via Claude 'e2e' phase
- FAIL blocks downstream pipeline
- Results posted as GitHub comment

## Risk Assessment

- **agent-browser availability**: CLI might not be installed → Claude error output, mark as FAIL
- **Base URL unreachable**: App might not be running → timeout, detect as FAIL
- **180s timeout**: Complex E2E flows might need more time — acceptable for v1
