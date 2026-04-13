---
phase: 3
status: done
priority: high
effort: low
---

# Phase 3 — Roadmap Loader Lesson Capture

## Context

- `src/commands/build/epic-executor.ts` — `executeFromRoadmap()` at line 357
- Current pipeline per task: plan → cook → commit → checklist sync
- Missing: no lesson capture after successful cook
- `src/commands/sync/knowledge-writer.ts` — Phase 1 output
- `src/commands/sync/knowledge-extractor.ts` — Phase 2 output

## Overview

Add a lesson capture step in `executeFromRoadmap()` after successful `/ck:cook`. When cook succeeds, spawn a lightweight Claude call (haiku) to extract lesson candidates from the cook output, then feed to knowledge-writer. Also write a brief run summary per task (journal-style artifact).

## Key Insights

- Cook output (`result.stdout`) contains implementation details — rich source for lessons
- Use haiku for extraction (cheap, fast) — same as note-classifier
- Insert between cook success and commit step (line ~443 in epic-executor.ts)
- Run summary per task = simple file write (like run-recorder pattern)
- Keep it optional-feeling: if extraction fails, proceed to commit

## Requirements

### Functional
- After successful cook in `executeFromRoadmap()`, extract lesson candidates from cook stdout
- Use haiku to summarize: "What was learned implementing {task}? Any reusable patterns or gotchas?"
- Feed extracted lessons to `captureKnowledge()` with provenance: task title, phase, roadmap path
- Write a brief run summary to `Knowledge/` or `Review/Runs/` per task

### Non-functional
- Never block the roadmap pipeline — wrap in try/catch
- Extraction timeout: 30s max (haiku is fast)
- No new npm dependencies

## Architecture

### executeFromRoadmap() Pipeline Change

```
Current:
  plan → cook → commit → checklist

New:
  plan → cook → LESSON CAPTURE → commit → checklist
                  ↓
          captureFromCookOutput()
            → haiku extracts lessons
            → knowledge-writer writes to Knowledge/
            → write task run summary
```

### New Function

```typescript
// In epic-executor.ts or separate module
async function captureFromCookOutput(
  cookStdout: string,
  taskTitle: string,
  epicTitle: string,
  roadmapPath: string,
  vaultPath: string,
): Promise<void>
```

## Related Code Files

### Modify
- `src/commands/build/epic-executor.ts` — add lesson capture after cook success (line ~443)

### Create
- `src/commands/sync/cook-lesson-extractor.ts` — extract lessons from cook output via haiku, feed to knowledge-writer

## Implementation Steps

1. Create `src/commands/sync/cook-lesson-extractor.ts`:
   - `extractLessonsFromCook(cookOutput, metadata)` → calls haiku to extract lessons
   - Haiku prompt: "What was learned? Any reusable patterns, gotchas, or decisions? Output JSON array of lesson objects."
   - For each extracted lesson, call `captureKnowledge()` with provenance
   - Write task run summary to `Review/Runs/{date}-task-{id}.md`
   - 30s timeout, never throw

2. Update `src/commands/build/epic-executor.ts`:
   - Import `extractLessonsFromCook`
   - After cook success (line ~443, before commit step):
     ```typescript
     // Lesson capture — best-effort, never blocks pipeline
     try {
       await extractLessonsFromCook(result.stdout, issue.title, epic.title, roadmapPath, vaultPath);
     } catch { /* swallow */ }
     ```
   - Need to resolve `vaultPath` — read from project config or default to `obsidian-vault/`

3. Resolve vaultPath in executeFromRoadmap:
   - Add optional `vaultPath` to ExecutorOptions type
   - Default: `join(process.cwd(), 'obsidian-vault')`

## Todo

- [x] Create cook-lesson-extractor.ts
- [x] Implement haiku extraction prompt for cook output
- [x] Feed extracted lessons to captureKnowledge
- [x] Write task run summary file
- [x] Wire into executeFromRoadmap after cook success
- [x] Add vaultPath to ExecutorOptions with default

## Success Criteria

- After successful cook in roadmap execution, lessons extracted and written to Knowledge/
- Task run summary written to Review/Runs/
- Provenance frontmatter includes task title, phase, roadmap path
- Pipeline never blocks on extraction failures
- Haiku extraction completes in <30s

## Risk Assessment

- **Low**: Cook output might be too long for haiku context — mitigated by truncating to first 3000 chars
- **Low**: vaultPath might not exist in builder context — mitigated by mkdir recursive + default path
- **Medium**: Adding a step to roadmap-loader increases per-task time by ~5-10s — acceptable tradeoff
