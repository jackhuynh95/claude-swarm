---
phase: 03
status: ready
priority: medium
effort: low
---

# Phase 03 — Run Recorder for Review/Runs

## Context

- Post-ship runner: [src/commands/watch/phases/post-ship-runner.ts](../../src/commands/watch/phases/post-ship-runner.ts)
- Vault Review/Runs dir: `obsidian-vault/Review/Runs/`
- Phase result type: [src/commands/watch/types.ts](../../src/commands/watch/types.ts) → `PhaseResult`

## Overview

After each watcher run completes, store a structured summary in `obsidian-vault/Review/Runs/` as a markdown file. This gives humans a browsable history of all automated runs with test results, verdicts, and timing data.

## Requirements

### Functional
- Write one markdown file per issue run: `{YYYY-MM-DD}-issue-{number}.md`
- Include: issue metadata, all phase results, verdict, duration, errors, PR link
- Frontmatter with tags, date, issue number for Obsidian search
- Append if same issue processed multiple times in one day (retry scenarios)

### Non-functional
- Pure file write — no Claude invocation needed
- Best-effort, never blocks pipeline
- Keep files under 200 lines

## Implementation Steps

1. **Create `run-recorder.ts`**:
   ```typescript
   import { writeFile, readFile, mkdir } from 'node:fs/promises';
   import { join } from 'node:path';
   import type { ClassifiedIssue, PhaseResult } from '../types.js';
   import type { VerifyVerdict } from './verifier.js';
   
   export interface RunRecordConfig {
     vaultPath: string;
   }
   ```

2. **`recordRun(classified, config, flowResults, postShipResults, verdict)`**:
   - Build markdown with frontmatter:
     ```yaml
     ---
     date: YYYY-MM-DD
     issue: {number}
     type: {issueType}
     verdict: {verdict}
     tags: [run, claude-swarm]
     ---
     ```
   - Body sections:
     ```markdown
     # Run: Issue #{number} — {title}
     
     | Field | Value |
     |-------|-------|
     | Type | {issueType} |
     | Verdict | {verdict} |
     | Total Duration | {totalMs} |
     | PR | {prUrl or none} |
     
     ## Phase Results
     | Phase | Status | Duration | Error |
     |-------|--------|----------|-------|
     | plan | ok | 45s | — |
     | fix | ok | 120s | — |
     | verify | PASS | 30s | — |
     ...
     
     ## Errors
     {error details or "None"}
     ```
   - Write to `{vaultPath}/Review/Runs/{date}-issue-{number}.md`
   - If file exists (retry), append `## Retry — HH:MM` section

3. **Wire into `post-ship-runner.ts`**:
   - Call `recordRun()` after journal phase (step 6, last thing)
   - Wrap in try/catch — never blocks

## Files to Create

| File | Purpose |
|------|---------|
| `src/commands/watch/phases/run-recorder.ts` | Write structured run summaries to vault |

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/phases/post-ship-runner.ts` | Add recordRun() call after journal |

## Todo

- [x] Create `run-recorder.ts` with `recordRun()`
- [x] Build markdown template with frontmatter + phase table
- [x] Handle append for retry scenarios
- [x] Wire into post-ship-runner.ts after journal phase
- [x] Verify compiles

## Success Criteria

- Each watcher run produces a file in `obsidian-vault/Review/Runs/`
- Files have Obsidian-compatible frontmatter (searchable by date, issue, verdict)
- Retry runs append to existing file rather than overwrite
- Never blocks pipeline on error
