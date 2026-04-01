# Phase 4: Cost Tracker

**Priority**: Medium
**Status**: Complete
**Roadmap task**: #36 (nightly cost summary)

## Overview

Track per-run costs and generate a nightly summary. Logs each Claude invocation with estimated cost, aggregates daily, outputs summary to stdout (or Slack via existing slack-reporter).

## Context Links

- `src/commands/watch/phases/budget-guard.ts` — budget-guard already tracks invocations; cost-tracker adds dollar estimates
- `src/commands/watch/phases/slack-reporter.ts` — can relay nightly summary

## Key Insights

- Claude API pricing (approx): opus ~$15/M input + $75/M output, sonnet ~$3/M input + $15/M output, haiku ~$0.25/M + $1.25/M
- We estimate tokens from output length — for cost, multiply by model rate
- Nightly summary: aggregate all issues processed today, total estimated cost, top-3 costliest issues
- Persist to `.ck-costs.json` with daily buckets

## Architecture

```
cost-tracker.ts:
  recordRunCost(issueNum, phase, model, result) → void
  getDailySummary(date?) → CostSummary
  generateNightlyReport(date?) → string (formatted markdown)

.ck-costs.json:
{
  "2026-04-01": {
    "runs": [
      { "issue": 42, "phase": "plan", "model": "opus", "tokens": 5000, "costUsd": 0.075, "ts": "..." },
      ...
    ],
    "totalUsd": 1.23
  }
}
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/cost-tracker.ts`

## Implementation Steps

1. Define cost rates as const map:
   ```ts
   const COST_PER_1K_TOKENS: Record<ClaudeModel, { input: number; output: number }> = {
     opus:   { input: 0.015, output: 0.075 },
     sonnet: { input: 0.003, output: 0.015 },
     haiku:  { input: 0.00025, output: 0.00125 },
   };
   ```

2. **`recordRunCost(issueNum, phase, model, result)`**
   - Estimate output tokens: `Math.ceil((result.output?.length ?? 0) / 4)`
   - Estimate input tokens: `Math.ceil(prompt.length / 4)` (accept as param or estimate ~2x output)
   - Calculate cost: `(inputTokens * rate.input + outputTokens * rate.output) / 1000`
   - Append to daily bucket in `.ck-costs.json`
   - Update daily total

3. **`getDailySummary(date?: string): CostSummary`**
   - Load `.ck-costs.json`, find bucket for date (default today)
   - Return `{ date, totalUsd, runCount, topIssues: [...] }`

4. **`generateNightlyReport(date?: string): string`**
   - Call `getDailySummary()`
   - Format as markdown:
     ```
     ## Nightly Cost Summary — 2026-04-01
     - Total runs: 15
     - Estimated cost: $2.34
     - Top issues: #42 ($0.89), #17 ($0.67), #5 ($0.45)
     ```

5. Nightly trigger: add `--nightly-summary` flag to watch command or standalone `claude-swarm costs` subcommand (integration phase).

## Success Criteria

- [ ] Each Claude invocation logged with cost estimate
- [ ] Daily summary aggregates correctly
- [ ] Nightly report formatted as readable markdown
- [ ] Cost data persists across restarts
- [ ] `npm run build` compiles without errors

## Risk Assessment

- **Cost estimates are approximate**: Token count from char length is rough, pricing may change — acceptable for budgeting awareness, not billing
