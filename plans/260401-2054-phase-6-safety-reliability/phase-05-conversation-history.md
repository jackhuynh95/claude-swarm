# Phase 5: Conversation History

**Priority**: High
**Status**: Complete
**Roadmap task**: #37 (conversation history tracking across phases)

## Overview

Track all phase outputs for each issue across its lifecycle. Enables: feeding prior context into retry cycles, post-mortem analysis, and continuity when phases span multiple watcher cycles.

## Context Links

- `src/commands/watch/types.ts` — `PhaseResult`, `IssueState`
- `src/commands/watch/phases/debug-flow.ts` — already passes `failureContext` between cycles; history formalizes this
- `src/commands/watch/phases/post-ship-runner.ts` — passes `flowResults` to slack-reporter/journal

## Key Insights

- Currently debug-flow tracks failure context in-memory within a single run — lost on crash
- ship-flow has no context carry-forward at all
- History file persists per-issue, survives restarts
- Kept separate from budget/cost files (different lifecycle)

## Architecture

```
conversation-history.ts:
  recordPhaseOutput(issueNum, phase, result, metadata?) → void
  getIssueHistory(issueNum) → PhaseEntry[]
  getLastPhaseOutput(issueNum, phase?) → PhaseEntry | undefined
  clearIssueHistory(issueNum) → void

.ck-history.json:
{
  "42": {
    "entries": [
      { "phase": "debug", "success": true, "output": "...", "ts": "...", "durationMs": 5000 },
      { "phase": "fix", "success": true, "output": "...", "ts": "..." },
      { "phase": "test", "success": false, "output": "Tests failed: ...", "ts": "..." },
      ...
    ],
    "state": "implementing",
    "startedAt": "2026-04-01T10:00:00Z"
  }
}
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/conversation-history.ts`

**Modify:**
- `src/commands/watch/phases/debug-flow.ts` — record each phase, use history for `failureContext`
- `src/commands/watch/phases/ship-flow.ts` — record each phase

## Implementation Steps

1. Create `conversation-history.ts`:

2. **`ConversationHistory` class:**
   - Constructor takes file path (default `.ck-history.json`)
   - `loadState()` / `saveState()` — same atomic write pattern as budget-guard

3. **`recordPhaseOutput(issueNum, phase, result, metadata?)`**
   - Append entry to issue's `entries` array
   - Entry: `{ phase, success: result.success, output: result.output?.slice(0, 10000), error: result.error, ts: new Date().toISOString(), durationMs: result.durationMs }`
   - Truncate stored output to 10000 chars to prevent file bloat
   - Save state

4. **`getIssueHistory(issueNum): PhaseEntry[]`**
   - Return all entries for issue, or empty array if none

5. **`getLastPhaseOutput(issueNum, phase?): PhaseEntry | undefined`**
   - If phase specified: find last entry matching that phase
   - If no phase: return last entry overall

6. **`clearIssueHistory(issueNum): void`**
   - Remove issue key from state, save

7. Wire into `debug-flow.ts`:
   - Replace in-memory `failureContext` with `history.getLastPhaseOutput(issue.number, 'test')?.output`
   - After each `invokeClaudePhase()`, call `history.recordPhaseOutput()`

8. Wire into `ship-flow.ts`:
   - After plan and cook phases, call `history.recordPhaseOutput()`

## Success Criteria

- [ ] Phase outputs persisted per issue in `.ck-history.json`
- [ ] Output truncated to 10K chars per entry (prevents file bloat)
- [ ] debug-flow uses persisted history instead of in-memory failureContext
- [ ] ship-flow records all phases
- [ ] History survives process restarts
- [ ] `npm run build` compiles without errors

## Risk Assessment

- **File size growth**: 10K per entry * 20 invocations * many issues → could grow large. Mitigated by truncation + `clearIssueHistory()` on completion. Periodic cleanup can be added later.
