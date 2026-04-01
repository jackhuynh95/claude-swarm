# Phase 3: Slack Reporter

**Priority**: Medium
**Status**: Complete
**File**: `src/commands/watch/phases/slack-reporter.ts`

---

## Overview

Post-ship Slack reporting. Sends issue completion summary to team channel via `/slack-report` skill or direct `gh` + webhook approach. Uses 'slack_report' PhaseType (haiku, 30s, 1 turn).

## Context Links

- Types: `src/commands/watch/types.ts` (PhaseType='slack_report')
- Model config: `src/commands/watch/phases/model-router.ts` (slack_report: haiku, 30s, 1 turn, Bash)
- Invoker: `src/commands/watch/phases/claude-invoker.ts`
- CK skill: `/slack-report` skill in `.claude/skills/`

## Key Insights

- Lightest phase — haiku model, 1 turn, 30s timeout
- Does NOT block pipeline on failure — reporting is best-effort
- Summarizes: issue number, title, verdict, PR URL, duration
- Two approaches: Claude invokes /slack-report skill, OR direct webhook POST
- Direct webhook is simpler and doesn't need Claude — but using Claude enables natural language summaries

## Architecture

```
Input: ClassifiedIssue + SlackConfig + flowResults (PhaseResult[])
  │
  ├─ 1. Build summary from flow results:
  │     - Issue #{number}: {title}
  │     - Verdict: {PASS/FAIL/PARTIAL}
  │     - PR: {url or "none"}
  │     - Duration: {total ms}
  │     - Phases: {count passed}/{count total}
  │
  ├─ 2a. (Claude path) Invoke haiku to format + post via /slack-report
  │   OR
  ├─ 2b. (Direct path) POST to Slack webhook with formatted message
  │
  └─ 3. Return PhaseResult (always success unless network failure)
```

## Related Code Files

**Modify**: None
**Create**: `src/commands/watch/phases/slack-reporter.ts`
**Read**: `types.ts`, `claude-invoker.ts`

## Implementation Steps

1. Create `slack-reporter.ts` with exports:
   ```typescript
   export interface SlackReporterConfig {
     repo: string;
     autoMode: boolean;
     webhookUrl?: string;    // direct Slack webhook (optional)
     cwd?: string;
   }
   ```
2. Implement `executeSlackReport(classified, config, flowResults, verifyVerdict?)`:
   - Build summary object from flowResults array:
     - Total duration: sum of all PhaseResult.durationMs
     - Phase count: passed vs total
     - PR URL: find first artifact matching PR pattern
     - Verdict: from verifier result if provided
   - Build prompt for Claude:
     ```
     Send a Slack report for completed issue.
     
     Issue: #{number} — {title}
     Repo: {repo}
     Verdict: {verdict}
     PR: {prUrl}
     Duration: {durationFormatted}
     Phases: {passed}/{total} passed
     
     Use the /slack-report skill to send this to the team channel.
     Keep the message concise — 2-3 lines max.
     ```
3. Invoke via `invokeClaudePhase(prompt, 'slack_report', undefined, autoMode, cwd)`
   - Note: no modelOverride — always haiku for reporting (cheap + fast)
4. Never transition labels — reporting doesn't change state
5. Never block pipeline — catch errors, return success=false but don't throw
6. Return PhaseResult

## Todo

- [x] Create slack-reporter.ts file
- [x] Export SlackReporterConfig type
- [x] Implement executeSlackReport() with summary builder
- [x] Build concise Slack report prompt
- [x] Invoke via 'slack_report' phase (haiku)
- [x] Ensure never blocks pipeline (catch all errors)
- [x] Verify `npm run build` compiles

## Success Criteria

- Sends summary to Slack via /slack-report skill
- Never blocks pipeline on failure
- Includes: issue number, title, verdict, PR URL, duration
- Uses haiku (cheapest model) for formatting

## Risk Assessment

- **Slack webhook not configured**: Skip gracefully, log warning
- **30s timeout**: Should be plenty for a 1-turn haiku call
- **/slack-report skill missing**: Claude will error — caught, pipeline continues
