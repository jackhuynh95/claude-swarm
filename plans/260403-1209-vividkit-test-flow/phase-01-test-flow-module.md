---
phase: 1
title: Test Flow Module
status: complete
priority: high
effort: medium
files_modify: [src/commands/watch/types.ts, src/commands/watch/phases/model-router.ts]
files_create: [src/commands/watch/phases/test-flow.ts]
---

# Phase 1 — Test Flow Module

## Overview

Create `test-flow.ts` implementing the green testing pipeline. Add required phase types and configs. Route test commands based on issue labels/content.

## Context

- Existing phases: `src/commands/watch/phases/debug-flow.ts` (177 lines), `ship-flow.ts` (172 lines)
- Reuse pattern: config interface → main executor → prompt builder → result parser → comment poster
- E2E delegation: `e2e-runner.ts` already handles `/ck:test --e2e` via `executeE2e()`
- Existing `test` and `e2e` PhaseTypes already in model-router

## Implementation Steps

### Step 1: Extend `PhaseType` in `types.ts`

Add `'scenario' | 'ui_test'` to the `PhaseType` union (line ~39-44):

```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'scout' | 'code_review'
  | 'scenario' | 'ui_test'              // ← ADD
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';
```

### Step 2: Add phase configs in `model-router.ts`

Add two entries to `PHASE_CONFIGS` (after `code_review` line ~16):

```typescript
scenario:   { model: 'sonnet', effort: 'low',  maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
ui_test:    { model: 'sonnet', effort: 'low',  maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
```

### Step 3: Create `test-flow.ts`

New file: `src/commands/watch/phases/test-flow.ts`

**Exports:**
```typescript
export interface TestFlowConfig {
  repo: string;
  autoMode: boolean;
  baseUrl?: string;    // for E2E (passed to e2e-runner)
  cwd?: string;
}

export interface TestFlowResult {
  greenPass: boolean;
  results: PhaseResult[];
}

export async function executeTestFlow(
  classified: ClassifiedIssue,
  config: TestFlowConfig,
): Promise<TestFlowResult>
```

**Pipeline (sequential, fail-fast on unit/integration test):**

1. **`/ck:scenario`** — Generate BDD/Gherkin test scenarios from issue content
   - Phase: `scenario`
   - Prompt: issue number + title + body → generate test scenarios
   - Advisory only — never blocks pipeline
   - Skip if issue body is empty/null

2. **`/ck:test`** — Run unit + integration tests
   - Phase: `test` (existing config)
   - Prompt: `/ck:test Run unit and integration tests for #{issue.number}`
   - **FAIL blocks pipeline** — return greenPass=false immediately

3. **`/ck:test --ui`** — Visual UI tests (conditional)
   - Trigger: `classified.flags.designReview` is true (frontend/ui label)
   - Phase: `ui_test`
   - Prompt: `/ck:test --ui Run visual UI tests for #{issue.number}`
   - Advisory only — log result but don't block

4. **`/ck:test --e2e`** — Browser E2E tests (conditional)
   - Trigger: `parseE2eScenariosFromBody(issue.body).length > 0` OR `config.baseUrl` is set
   - Delegate to existing `executeE2e()` from `e2e-runner.ts`
   - **FAIL blocks pipeline** — return greenPass=false

5. **Comment** — Post green test summary to issue
   - Format: `GREEN PASS` or `GREEN FAIL` with phase breakdown

**Result parsing:**
- Unit/integration: check `phaseResult.success` (exit code 0) + output heuristics
- Use same PASS/FAIL patterns as e2e-runner: `/all.*pass|tests.*pass|0 failed/i`

**Prompt templates:**

Scenario prompt:
```
/ck:scenario Generate BDD/Gherkin test scenarios for issue #N: TITLE

Issue description:
BODY

Generate comprehensive test scenarios covering:
- Happy path
- Edge cases  
- Error scenarios
Report as structured Gherkin features.
```

Test prompt:
```
/ck:test Run unit and integration tests for issue #N: TITLE

Verify the implementation satisfies:
BODY

Run the project's test suite. Report results as:
TEST_RESULT: PASS — [summary]
or
TEST_RESULT: FAIL — [what failed]
```

UI test prompt:
```
/ck:test --ui Run visual UI tests for issue #N: TITLE

Check for:
- Visual regressions
- Layout consistency
- Responsive design issues
- Accessibility violations

Report results as:
UI_TEST_RESULT: PASS — [summary]
or
UI_TEST_RESULT: FAIL — [what failed]
```

**Comment format:**
```
<!-- claude-swarm:green-test -->
{icon} **Green Test Result for #{issueNum}: {status}**

| Phase | Result |
|-------|--------|
| Scenario | {generated/skipped} |
| Unit + Integration | {PASS/FAIL} |
| UI Tests | {PASS/FAIL/skipped} |
| E2E Tests | {PASS/FAIL/skipped} |
```

## File Sizes (estimated)

| File | Lines | Change |
|------|-------|--------|
| `types.ts` | 126 → ~128 | +2 (PhaseType union) |
| `model-router.ts` | 56 → ~58 | +2 (phase configs) |
| `test-flow.ts` | ~140 | New file |

## Todo

- [x] Add `scenario` and `ui_test` to PhaseType in types.ts
- [x] Add phase configs for `scenario` and `ui_test` in model-router.ts
- [x] Create test-flow.ts with TestFlowConfig, TestFlowResult, executeTestFlow
- [x] Implement /ck:scenario step (advisory, skip if no body)
- [x] Implement /ck:test step (fail-fast on failure)
- [x] Implement /ck:test --ui step (conditional on designReview flag)
- [x] Implement /ck:test --e2e step (delegate to e2e-runner, conditional)
- [x] Add green test summary comment
- [x] Compile check — `npx tsc --noEmit`

## Success Criteria

- `test-flow.ts` follows same pattern as `debug-flow.ts` and `ship-flow.ts`
- Unit test failure blocks pipeline (greenPass=false)
- E2E failure blocks pipeline (greenPass=false)
- UI test and scenario are advisory (never block)
- Conditional routing: `--ui` only for frontend labels, `--e2e` only when scenarios exist or baseUrl set
- File stays under 200 lines
- TypeScript compiles without errors

## Risk Assessment

- **Low risk**: This is a new file, no existing code modified except type additions
- **E2E delegation**: Reuses battle-tested `executeE2e()` — no new E2E logic needed
- **Phase type addition**: Minor — just extending a union type and adding config entries
