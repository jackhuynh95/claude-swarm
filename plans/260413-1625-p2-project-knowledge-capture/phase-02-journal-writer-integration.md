---
phase: 2
status: done
priority: high
effort: medium
---

# Phase 2 — Journal Writer + Run Recorder Knowledge Integration

## Context

- `src/commands/watch/phases/journal-writer.ts` — Claude-invoked, writes Daily/ + Notes/
- `src/commands/watch/phases/run-recorder.ts` — direct file write, writes Review/Runs/
- `src/commands/sync/knowledge-writer.ts` — Phase 1 output, writes Knowledge/
- Both are called from `post-ship-runner.ts` (lines 196-217)

## Overview

Teach journal-writer and run-recorder outputs to feed local knowledge capture. After journal writes lessons to Notes/, also classify and promote to Knowledge/. After run-recorder writes a run summary, extract lesson candidates and feed to knowledge-writer.

## Key Insights

- journal-writer is Claude-invoked (prompt-based) — can't directly call knowledge-writer from its output
- Best approach: add a **post-journal knowledge extraction step** in post-ship-runner.ts
- run-recorder writes structured data — can extract lessons from error patterns and phase failures
- Keep changes minimal: add 1 new step in post-ship-runner.ts after journal + run-recorder

## Requirements

### Functional
- After journal-writer completes, scan newly written Notes/ files for knowledge candidates
- After run-recorder completes, extract lesson candidates from failed phases / retries
- Feed candidates to `captureKnowledge()` from knowledge-writer
- Pass provenance: issue number, project name, source-phase ("journal" or "run-record"), date

### Non-functional
- Best-effort — never block pipeline
- Minimal changes to existing files (add steps, don't rewrite)
- run-recorder extraction should be simple heuristic, not Claude-invoked

## Architecture

### Post-Ship Runner Addition (post-ship-runner.ts)

```
Current flow:
  ... → journal → llms → run-recorder → return

New flow:
  ... → journal → llms → run-recorder → KNOWLEDGE EXTRACTION → return
```

### Knowledge Extraction Step

```typescript
// New function in post-ship-runner.ts or new small module
async function extractAndCaptureKnowledge(
  vaultPath: string,
  classified: ClassifiedIssue,
  flowResults: PhaseResult[],
  postShipResults: PhaseResult[],
): Promise<void>
```

**Two extraction strategies:**

1. **From Notes/ scan**: Read recently written Notes/ files (mtime < 5min), feed to captureKnowledge
2. **From run data**: If any phase failed or retried, build a lesson candidate string describing the failure pattern

## Related Code Files

### Modify
- `src/commands/watch/phases/post-ship-runner.ts` — add knowledge extraction step after run-recorder (line ~217)

### Create
- `src/commands/sync/knowledge-extractor.ts` — small module: scan recent Notes/, extract from run data, feed to captureKnowledge

## Implementation Steps

1. Create `src/commands/sync/knowledge-extractor.ts`:
   - `extractFromRecentNotes(vaultPath, metadata)` — scan Notes/ for files modified in last 5 min, feed each to `captureKnowledge()`
   - `extractFromRunResults(vaultPath, results, metadata)` — build lesson strings from failed/retried phases, feed to `captureKnowledge()`
   - `extractKnowledge(vaultPath, classified, flowResults, postShipResults)` — orchestrator calling both

2. Update `src/commands/watch/phases/post-ship-runner.ts`:
   - Import `extractKnowledge` from knowledge-extractor
   - Add step 12 after run-recorder (line ~217): call `extractKnowledge()` wrapped in try/catch
   - Pass metadata: `{ issue: issue.number, project: repo name, sourcePhase: 'journal', date: today }`

## Todo

- [x] Create knowledge-extractor.ts with extractFromRecentNotes
- [x] Add extractFromRunResults for failed phase lessons
- [x] Wire extractKnowledge into post-ship-runner.ts after run-recorder
- [x] Pass provenance metadata from classified issue context

## Success Criteria

- After post-ship completes, Knowledge/ directories contain classified notes from the run
- Failed phases produce lesson candidates in Knowledge/Lessons/
- Best-effort — pipeline never blocks on knowledge extraction failures
- Provenance frontmatter traces back to source issue and phase

## Risk Assessment

- **Low**: Notes/ scan might pick up old files — mitigated by 5-min mtime filter
- **Low**: Run data extraction might produce low-quality lessons — acceptable, classifier filters
