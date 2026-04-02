---
status: pending
priority: high
blockedBy: [260402-1650-build-phase0-roadmap-generator]
blocks: []
---

# Phase 1: Roadmap Parser

**Date**: 2026-04-02
**Goal**: Parse markdown roadmap files into structured JSON for GitHub hierarchy creation
**Location**: `src/commands/build/roadmap-parser.ts`

## Overview

Create a markdown parser that reads `implement-roadmap-*.md` files and extracts a 4-layer hierarchy: milestone > epics > issues > sub-issues. Supports two formats: phase-table format (`## Phase N —`) and epic-table format (`### Epic N —`). Uses zod for output validation.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Install zod, create types + schema | Pending |
| 2 | Implement parser core (milestone, epics, issues, subs) | Pending |
| 3 | Support dual format detection | Pending |
| 4 | Wire into build-command.ts (init subcommand) | Pending |
| 5 | Compile check | Pending |

## Dependencies

- `zod` (new — install)
- `commander` (existing)
- `build-command.ts` (existing — add `init` subcommand)

## Files to Create

- `src/commands/build/roadmap-parser.ts` — Parser logic + zod schemas + types

## Files to Modify

- `src/commands/build/build-command.ts` — Add `init` subcommand calling parser
- `package.json` — Add `zod` dependency

## Architecture

```
roadmap-parser.ts
├── Zod Schemas
│   ├── SubIssueSchema (string)
│   ├── IssueSchema { id, title, type, status, subs }
│   ├── EpicSchema { title, issues }
│   └── RoadmapSchema { milestone, epics }
├── Format Detection
│   ├── detectFormat(content) → 'phase' | 'epic'
│   └── Checks for ## Phase vs ### Epic heading patterns
├── Parsing Functions
│   ├── parseMilestone(content) → string
│   ├── parseEpics(content, format) → Epic[]
│   ├── parseTable(tableBlock) → Issue[]
│   └── parseSubIssues(rows) → string[]
└── Public API
    └── parseRoadmap(filePath) → Roadmap (validated)
```

## Implementation Steps

### Step 1: Install zod + create types

```bash
npm install zod
```

Define zod schemas:

```typescript
import { z } from 'zod';

const SubIssueSchema = z.string();

const IssueSchema = z.object({
  id: z.string(),              // "1", "0a", etc.
  title: z.string(),
  type: z.enum(['feature', 'bug', 'docs', 'chore', 'unknown']).default('feature'),
  status: z.string().default('Pending'),
  subs: z.array(SubIssueSchema).default([]),
});

const EpicSchema = z.object({
  title: z.string(),           // "Phase 1 — Foundation" or "Epic 1: Integration Testing"
  issues: z.array(IssueSchema),
});

const RoadmapSchema = z.object({
  milestone: z.string(),
  epics: z.array(EpicSchema),
});

export type SubIssue = z.infer<typeof SubIssueSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
```

### Step 2: Implement parser core

**Milestone parsing:**
- Extract from first `# Title` heading (strip markdown formatting)
- Fallback: look for `## Milestone:` pattern

**Epic parsing (format-dependent):**
- **Phase format**: Split on `## Phase N —` headings (h2)
- **Epic format**: Split on `### Epic N —` headings (h3)
- Extract title from heading text

**Issue parsing (shared):**
- Find markdown tables within each epic section
- Parse rows: `| id | title | status |` (3-column table)
- Detect type from title keywords: `[BUG]` → bug, `[DOCS]` → docs, etc.
- Default type: `feature`

**Sub-issue parsing:**
- Sub-issues are indented rows under a parent issue in the table
- Pattern: `|   | Sub-task text | status |` (empty or indented ID cell)
- OR bullet lists immediately following a table row
- Collect as string array on parent issue

### Step 3: Format detection

```typescript
function detectFormat(content: string): 'phase' | 'epic' {
  const hasEpicHeadings = /^###\s+Epic\s+\d+/m.test(content);
  const hasPhaseHeadings = /^##\s+Phase\s+\d+/m.test(content);

  if (hasEpicHeadings) return 'epic';
  return 'phase'; // default to phase format
}
```

### Step 4: Wire into build-command.ts

Add `init` subcommand:

```typescript
buildCommand
  .command('init <roadmap>')
  .description('Parse roadmap and create GitHub hierarchy')
  .option('--dry-run', 'Show parsed structure without creating issues')
  .action(async (roadmapPath, options) => {
    const parsed = await parseRoadmap(roadmapPath.replace(/^@/, ''));
    if (options.dryRun) {
      console.log(JSON.stringify(parsed, null, 2));
      return;
    }
    // TODO: Phase 2 will wire to github-hierarchy.ts
    console.log(JSON.stringify(parsed, null, 2));
  });
```

### Step 5: Compile check

```bash
npx tsc --noEmit
```

## Input Format Examples

### Format 1: Phase Tables (implement-roadmap.md)

```markdown
# Claude-Swarm Implementation Roadmap

## Phase 1 — Foundation (Fork + Skeleton)

| # | Task | Status |
|---|---|---|
| 1 | Fork repo | Done |
| 2 | Set up project structure | Done |
```

**Parsed as:**
- milestone: "Claude-Swarm Implementation Roadmap"
- epic[0].title: "Phase 1 — Foundation (Fork + Skeleton)"
- epic[0].issues[0]: { id: "1", title: "Fork repo", status: "Done" }

### Format 2: Epic Tables (implement-roadmap-4layers.md / implement-roadmap-builder.md)

```markdown
# Builder Tool v2.1

### Epic 1 — Integration Testing

| # | Task | Status |
|---|---|---|
| 1 | Wire watch loop | Pending |
|   | Configure test repo | Pending |
|   | Run full poll cycle | Pending |
```

**Parsed as:**
- milestone: "Builder Tool v2.1"
- epic[0].title: "Epic 1 — Integration Testing"
- epic[0].issues[0]: { id: "1", title: "Wire watch loop", subs: ["Configure test repo", "Run full poll cycle"] }

## Success Criteria

- [x] Correctly parses milestone from `# Title` heading
- [x] Correctly parses epics from `## Phase N` or `### Epic N` headings
- [x] Correctly parses issues from markdown table rows
- [x] Correctly parses sub-issues from indented/empty-id rows
- [x] Output validates against zod schema
- [x] Handles both implement-roadmap.md and epic-table formats
- [x] `npx tsc --noEmit` passes
- [x] `build init @roadmap.md --dry-run` prints parsed JSON

## Risk Assessment

- **Low**: Regex-based parsing may miss edge cases in unusual markdown
  - Mitigation: Use line-by-line state machine, not single regex
- **Low**: Sub-issue detection ambiguity (indented vs. new issue)
  - Mitigation: Empty/whitespace-only ID cell = sub-issue

## Cook Command

```bash
claude -p "/ck:cook --auto @/Users/jackhuynh/Documents/GitHub/claude-swarm/plans/260402-1658-build-phase1-roadmap-parser/plan.md"
```
