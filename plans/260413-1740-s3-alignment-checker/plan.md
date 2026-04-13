---
status: complete
phase: S3
track: Secondary
blockedBy: []
blocks: []
---

# S3 — Global Alignment Checker

## Overview

- **Priority**: Secondary (global/shared sync)
- **Status**: Ready
- **Goal**: Detect drift, contradictions, and outdated copies between project vault notes and second-brain notes. Report recommended sync direction.

## Key Insights

- Follows same patterns as `smart-pull.ts` and `smart-push.ts` — scan dirs, batch Claude calls, structured JSON output
- Uses `sonnet` at low effort (comparing two versions is simpler than full relevance scoring)
- Must handle notes that exist in both vaults with same filename but different content
- Frontmatter `synced-at` and `promoted-date` timestamps drive staleness detection
- No cycle guard needed — alignment check is read-only (no writes unless `--auto-update`)

## Architecture

```
alignment-check --project medusa:
  1. Scan project vault (Notes/, Knowledge/*, Daily/, Decisions/)
  2. Scan second-brain (_lessons/, _patterns/, _decisions/)
  3. Match notes by filename (case-insensitive, strip date prefix)
  4. For each matched pair:
     a. Compare frontmatter timestamps (quick staleness check)
     b. If content differs → batch to Claude for drift analysis
  5. Report: aligned | outdated | contradicting | superseded
  6. Recommend direction: project→brain | brain→project | manual-review
  7. Optional --auto-update: newer wins (backup old version first)
```

## Related Code Files

### Modify
- (none — new file)

### Create
- `src/commands/sync/alignment-checker.ts`

### Reuse (imports)
- `src/commands/sync/frontmatter-parser.ts` — `parseFrontmatter`, `hasFrontmatter`
- `src/commands/sync/note-classifier.ts` — `NoteInput` type
- `src/commands/sync/smart-pull.ts` — scan patterns, `stripDatePrefix` logic

## Phases

- [Phase 1: Core alignment checker](./phase-01-alignment-checker.md)
