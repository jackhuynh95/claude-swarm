---
phase: 1
status: complete
priority: medium
effort: small
---

# Phase 1 — Alignment Checker Implementation

## Context
- Roadmap: S3 — Global Alignment Check
- Existing patterns: `smart-pull.ts`, `smart-push.ts`, `relevance-filter.ts`
- Target file: `src/commands/sync/alignment-checker.ts`

## Requirements

### Functional
1. Scan project vault dirs and second-brain dirs for `.md` files
2. Match notes by filename (case-insensitive, strip date prefixes like `2026-04-01-`)
3. For matched pairs where content differs — batch to Claude sonnet for drift analysis
4. Classify each pair: `aligned` | `outdated` | `contradicting` | `superseded`
5. Report recommended direction: `project-to-brain` | `brain-to-project` | `manual-review`
6. `--auto-update` option: copy newer version over older, backup old as `.bak`
7. Dry-run mode: report only, no writes

### Non-functional
- Never throws — returns empty results on failure
- Batch pairs (max 10 per Claude call) to save tokens
- Model: `claude-sonnet-4-5-20250514` (same as relevance-filter)

## Implementation Steps

### 1. Types & interfaces (~20 lines)

```typescript
export interface AlignmentCheckOptions {
  vaultPath: string;    // project vault root
  brainPath: string;    // shared second-brain root
  projectName: string;  // for logging
  dryRun?: boolean;
  autoUpdate?: boolean; // copy newer version, backup old
}

export interface AlignmentDetail {
  filename: string;
  status: 'aligned' | 'outdated' | 'contradicting' | 'superseded';
  direction: 'project-to-brain' | 'brain-to-project' | 'manual-review' | 'none';
  reason: string;
  projectPath: string;
  brainPath: string;
  projectDate?: string;  // from frontmatter or file mtime
  brainDate?: string;
  updated?: boolean;     // true if auto-update applied
}

export interface AlignmentResult {
  total: number;
  aligned: number;
  drifted: number;
  details: AlignmentDetail[];
}
```

### 2. Scan helpers (~30 lines)

Reuse `scanDir` pattern from smart-pull. Scan dirs:
- Project: `Notes/`, `Knowledge/Lessons`, `Knowledge/Patterns`, `Knowledge/Decisions`, `Decisions/`
- Brain: `_lessons/`, `_patterns/`, `_decisions/`

Build `Map<normalizedFilename, { path, content, source }>` for each vault.

### 3. Match pairs (~20 lines)

Match by normalized filename (lowercase, stripped date prefix). For each match:
- If content identical → `aligned`, skip Claude call
- If content differs → queue for Claude batch analysis

### 4. Claude drift analysis (~60 lines)

Follow `relevance-filter.ts` pattern exactly:
- Zod schemas for response validation
- System prompt instructs Claude to compare two versions and classify
- Batch max 10 pairs per call
- Retry once on parse failure
- Never throw

**System prompt**:
```
You are a knowledge note alignment checker.
Given pairs of notes (project version vs brain version), classify each pair:
- "aligned": content is essentially the same, no action needed
- "outdated": one version is clearly older/less complete than the other
- "contradicting": versions contain conflicting information
- "superseded": one version has been completely replaced by new content

For outdated/superseded, specify direction:
- "project-to-brain": project version is newer, should update brain
- "brain-to-project": brain version is newer, should update project
For contradicting: always "manual-review"

Output JSON: { "results": [{ "filename", "status", "direction", "reason" }] }
```

### 5. Auto-update logic (~30 lines)

When `autoUpdate: true` and status is `outdated` or `superseded`:
- Backup old version as `{filename}.bak`
- Copy newer version to destination
- Add/update `synced-at` frontmatter via `mergeFrontmatter`

Skip auto-update for `contradicting` — always manual-review.

### 6. Main `checkAlignment()` export (~40 lines)

Wire everything together:
1. Scan both vaults
2. Build match pairs
3. Quick-filter aligned (content identical)
4. Batch remaining to Claude
5. Apply auto-update if enabled
6. Return `AlignmentResult`

## Todo List

- [x] Create `alignment-checker.ts` with types/interfaces
- [x] Implement vault scanning and pair matching
- [x] Implement Claude drift analysis with Zod validation
- [x] Implement auto-update with backup
- [x] Wire main `checkAlignment()` function
- [x] Verify TypeScript compiles cleanly

## Success Criteria

- `checkAlignment()` returns structured results for all matched pairs
- Identical notes classified as `aligned` without Claude call (token savings)
- Drift detected correctly: outdated vs contradicting vs superseded
- Auto-update copies newer version and creates `.bak` backup
- Dry-run mode produces report without writes
- File compiles with `npx tsc --noEmit`

## Risk Assessment

- **Low**: Claude misclassifies drift direction → mitigated by `manual-review` fallback for contradictions
- **Low**: Large vaults with many matches → mitigated by batching (10 pairs/call)

## Next Steps

- Wire into S4 (Shared Sync CLI) as `claude-swarm sync check`
