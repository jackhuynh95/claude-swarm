---
phase: 01
title: "Wire debrief into post-ship-runner.ts"
status: pending
priority: high
effort: small
---

# Phase 01 — Wire Debrief into post-ship-runner.ts

## Context Links

- Roadmap: Grill-Me + Debrief roadmap (Phase G5, task #25–26)
- Blocked by: `plans/260414-1638-g4-g5-debrief-skill-executor-wiring/` — debrief SKILL.md must exist
- Primary file: `src/commands/watch/phases/post-ship-runner.ts`
- Reference pattern: `journal-writer.ts` — same `invokeClaudePhase` + best-effort pattern

## Overview

- **Priority**: high
- **Status**: pending
- **Description**: Add a single `debrief` step (step 8.5) inside `executePostShip()` — after `executeSlackReport` and before `executeJournal` — so journal, run-recorder, and knowledge extraction receive the debrief context.

## Key Insights

- `invokeClaudePhase(prompt, 'debrief', ...)` is the right call pattern (matches scout, predict, llms)
- Debrief is best-effort: wrap in `try/catch`, push `PhaseResult` on success, push error result on failure — never block
- `classifiedIssue` has `issue.number`, `issue.title`, `issueType`, `flags` — enough to build a focused prompt
- Journal already receives `[...flowResults, ...results]` — debrief result must be appended to `results` before journal call
- Run-recorder and knowledge extraction are called with the full `results` array — debrief will naturally appear there once appended
- No new files, no new interfaces — inline everything in `post-ship-runner.ts`

## Requirements

### Functional
- Debrief phase runs after slack, before journal, every time pipeline reaches that step
- Debrief `PhaseResult` is in `results` before journal/llms/run-recorder/knowledge extraction
- Prompt tells the skill: issue number, title, issue type, verdict, key phase outcomes (pass/fail summary)
- Debrief artifact (if written by the skill) path is logged to console

### Non-functional
- Never blocks pipeline (try/catch)
- No new module — stay inside `post-ship-runner.ts`
- `post-ship-runner.ts` stays under 200 lines after change (currently 234 — need to keep addition lean, ~25 lines)

## Related Code Files

- **Modify**: `src/commands/watch/phases/post-ship-runner.ts`
- **Read-only reference**: `src/commands/watch/phases/journal-writer.ts` (pattern)
- **Prerequisite exists**: `.claude/skills/debrief/SKILL.md` (created by G4+G5 plan phase-01)

## Implementation Steps

### 1. Add `buildDebriefPrompt()` helper (~10 lines)

Add after `buildShipPrompt()` (around line 63), before `parseShipResult()`:

```typescript
function buildDebriefPrompt(
  issue: ClassifiedIssue['issue'],
  issueType: ClassifiedIssue['issueType'],
  verdict: 'PASS' | 'FAIL',
  results: PhaseResult[],
): string {
  const passed = results.filter(r => r.success).map(r => r.phase).join(', ');
  const failed = results.filter(r => !r.success).map(r => r.phase).join(', ');
  return `/ck:debrief Compare spec vs built for #${issue.number}: ${issue.title}

Type: ${issueType} | Verdict: ${verdict}
Passed phases: ${passed || 'none'}
Failed phases: ${failed || 'none'}

Check plans/ for spec.md and plan.md. Write debrief.md to plans/reports/.`;
}
```

### 2. Insert debrief invoke between slack and journal (~15 lines)

In `executePostShip()`, between the slack result push (step 8) and journal config (step 9):

```typescript
// 8.5. Debrief — compare spec/plan vs built, best-effort
try {
  const debriefResult = await invokeClaudePhase(
    buildDebriefPrompt(issue, classified.issueType, verdict, results),
    'debrief',
    config.configModels,
    config.cliOverrides,
    config.autoMode,
    config.cwd,
  );
  results.push(debriefResult);
  if (debriefResult.artifacts?.length) {
    console.log(`[post-ship] debrief artifact: ${debriefResult.artifacts[0]}`);
  }
} catch {
  // never block pipeline
}
```

### 3. No changes to journal, llms, run-recorder, or knowledge extraction calls

They already receive `[...flowResults, ...results]` — debrief result is automatically included once appended in step 2.

## Todo List

- [ ] Add `buildDebriefPrompt()` helper function after `buildShipPrompt()` in post-ship-runner.ts
- [ ] Insert debrief invoke block between slack (step 8) and journal (step 9)
- [ ] Verify `results` array is passed correctly to journal/run-recorder after debrief append
- [ ] Compile check: `npx tsc --noEmit` from repo root

## Success Criteria

- `npx tsc --noEmit` passes with no new errors
- Debrief step appears as step 8.5 in the orchestrate comment block at top of `executePostShip()`
- Journal receives debrief result in its `flowResults` input
- Run-recorder and knowledge extraction receive debrief in full `results`
- No pipeline blocking: failure in debrief does not stop journal/llms/run-recorder/knowledge-extraction

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| G4+G5 debrief skill not yet created | High (plan still pending) | This phase is blocked by that plan — do not implement until SKILL.md exists |
| post-ship-runner.ts exceeds 200 lines | Medium | Keep prompt builder concise; consider extracting `buildDebriefPrompt` to a shared util if needed post-implementation |
| Debrief skill writes to unexpected path | Low | Debrief is advisory — log artifact path, never assert on it |

## Security Considerations

- No user input flows through `buildDebriefPrompt` — issue title/number come from GitHub API, already sanitized upstream
- Debrief artifact is written by the skill process in a sandboxed Claude invocation — no shell injection risk

## Next Steps

- After this phase: G6 CLI surface (`claude-swarm debrief` command) and G7 completion policy
- Debrief output flowing into journal unlocks richer journal entries referencing spec drift
