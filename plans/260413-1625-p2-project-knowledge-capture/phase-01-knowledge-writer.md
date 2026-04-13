---
phase: 1
status: done
priority: high
effort: medium
---

# Phase 1 — Create Knowledge Writer Module

## Context

- P1 note-classifier: `src/commands/sync/note-classifier.ts` (complete)
- Current vault writer: `src/commands/watch/phases/run-recorder.ts` (direct file write pattern)
- Vault path configured via `vaultPath` in watcher/builder configs

## Overview

Create `src/commands/sync/knowledge-writer.ts` — takes raw lesson/pattern/decision text, classifies it via note-classifier, and writes to the correct `Knowledge/{category}/` subdirectory with provenance frontmatter.

## Key Insights

- note-classifier already returns `{ action, reason, category }` — reuse it
- run-recorder pattern (mkdir + writeFile) is the right approach for direct writes
- Must be best-effort (never throw, never block pipeline) like run-recorder
- Provenance frontmatter is critical for P4 metadata safety later

## Requirements

### Functional
- Accept raw note content + metadata (issue, project, source-phase, date)
- Classify via `classifyNote()` from note-classifier
- Write "promote" notes to `Knowledge/{Lessons,Patterns,Decisions}/` based on category
- Skip "project-specific" and "skip" classified notes (log skip reason)
- Generate kebab-case filename from note title/content
- Ensure directories exist (mkdir recursive)

### Non-functional
- Never throw — best-effort like run-recorder
- No new npm dependencies
- Under 120 lines

## Architecture

```
knowledge-writer.ts
  ├── captureKnowledge(vaultPath, note, metadata) → Promise<CaptureResult>
  │   ├── classifyNote() from note-classifier
  │   ├── if "skip" → return { captured: false, reason }
  │   ├── buildFrontmatter(metadata, classification)
  │   ├── mkdir Knowledge/{category}/
  │   └── writeFile
  └── types: KnowledgeNote, KnowledgeMetadata, CaptureResult
```

### Provenance Frontmatter Schema

```yaml
---
date: 2026-04-13
category: lesson | pattern | decision
source-phase: journal | run-record | cook | plan
issue: 42                    # optional, if from issue context
project: claude-swarm        # project name
tags: [knowledge, {category}]
classified-by: haiku         # model that classified
classification-reason: "reusable pattern for error handling"
---
```

### Category → Directory Mapping

```
lesson     → Knowledge/Lessons/
pattern    → Knowledge/Patterns/
decision   → Knowledge/Decisions/
foundation → Knowledge/Lessons/   (treat as lesson)
```

## Related Code Files

### Modify
- None (new file only)

### Create
- `src/commands/sync/knowledge-writer.ts`

## Implementation Steps

1. Create `src/commands/sync/knowledge-writer.ts`
2. Define types: `KnowledgeNote`, `KnowledgeMetadata`, `CaptureResult`
3. Implement `captureKnowledge(vaultPath, note, metadata)`:
   - Call `classifyNote()` from note-classifier
   - If action === "skip", return `{ captured: false, reason }`
   - Map category to directory: lesson/foundation → Lessons/, pattern → Patterns/, decision → Decisions/
   - Build frontmatter string from metadata + classification
   - Generate filename: kebab-case from note title, prefixed with date
   - `mkdir` target dir, `writeFile` with frontmatter + content
   - Return `{ captured: true, path, category }`
4. Export types and function

## Todo

- [x] Create knowledge-writer.ts with types
- [x] Implement captureKnowledge function
- [x] Map categories to Knowledge subdirectories
- [x] Build provenance frontmatter
- [x] Generate kebab-case filenames with date prefix
- [x] Handle errors gracefully (never throw)

## Success Criteria

- `captureKnowledge()` writes classified notes to correct Knowledge/ subdirectory
- Provenance frontmatter includes all required fields
- "skip" classified notes are not written (logged only)
- Never throws — returns result object on all paths
- Under 120 lines

## Risk Assessment

- **Low**: note-classifier API might change — mitigated by importing types directly
- **Low**: vault directory might not exist — mitigated by mkdir recursive
