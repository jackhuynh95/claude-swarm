# Phase 01 — spec-artifact-writer.ts Module

**Status**: pending
**Priority**: high

## Context

- Roadmap: `docs/implement-roadmap-grill-me-debrief.md` Phase G2
- Spec format: `plans/260414-1615-grill-me-command-skill/phase-01-grill-me-skill.md` (already defined)
- Frontmatter utils: `src/commands/sync/frontmatter-parser.ts` (reuse `buildFrontmatter`)
- Pattern reference: `src/commands/sync/knowledge-writer.ts`

## Overview

Create `src/commands/build/spec-artifact-writer.ts`. Provides three exports:
1. `SpecArtifact` — typed interface for in-memory spec data
2. `writeSpecArtifact(planDir, artifact)` — writes `plans/<planDir>/spec.md`
3. `readSpecArtifact(specPath)` — reads and parses spec.md back into `SpecArtifact`

The grill-me skill (Claude) already writes spec.md content via natural language. This module provides the programmatic layer for: path resolution, format enforcement, and downstream consumption by vault mirroring and future pipeline steps.

## SpecArtifact Interface

```ts
export interface SpecDecision {
  id: number;
  decision: string;
  optionsConsidered: string; // "A / B"
  chosen: string;
  rationale: string;
}

export interface SpecArtifact {
  // Frontmatter fields
  date: string;           // ISO date YYYY-MM-DD
  topic: string;          // user-provided topic string
  model: string;          // model used (e.g. claude-opus-4-6)
  status: 'pending' | 'reviewed' | 'approved';
  reviewedByHuman: boolean;
  source?: string;        // e.g. GitHub issue URL or roadmap path

  // Body sections
  summary: string;
  scopeIn: string[];
  scopeOut: string[];     // non-goals
  decisions: SpecDecision[];
  openQuestions: string[];
  risks: string[];
  acceptanceCriteria: string[];
}
```

## writeSpecArtifact Implementation

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeSpecArtifact(
  planDir: string,  // absolute or relative to cwd, e.g. "plans/260414-1630-..."
  artifact: SpecArtifact,
): Promise<string> {
  await mkdir(planDir, { recursive: true });
  const specPath = join(planDir, 'spec.md');
  const content = formatSpecArtifact(artifact);
  await writeFile(specPath, content, 'utf8');
  return specPath;
}
```

Format function builds:
1. YAML frontmatter block (date, topic, model, status, reviewed-by-human, source)
2. `## Summary` — paragraph
3. `## Scope (In)` — bullet list
4. `## Non-Goals (Out)` — bullet list
5. `## Decision Log` — markdown table
6. `## Deferred / Open Questions` — bullet list
7. `## Risks` — bullet list
8. `## Acceptance Criteria` — checkbox list

## readSpecArtifact Implementation

Parse existing spec.md. Use regex to extract frontmatter, then extract sections by heading. Return `SpecArtifact`. Return `null` on parse failure (never throws).

```ts
export async function readSpecArtifact(specPath: string): Promise<SpecArtifact | null>
```

Used by: vault mirror (phase-02), future debrief comparison (G4).

## Related Code Files

| Action | File |
|--------|------|
| Create | `src/commands/build/spec-artifact-writer.ts` |
| Read (for patterns) | `src/commands/sync/frontmatter-parser.ts` |
| Read (for patterns) | `src/commands/sync/knowledge-writer.ts` |

## Implementation Steps

1. Create `src/commands/build/spec-artifact-writer.ts`
2. Define `SpecDecision` and `SpecArtifact` interfaces
3. Implement `formatSpecArtifact(artifact): string`
   - Build frontmatter block manually (no dependency on `buildFrontmatter` — spec has custom fields)
   - Build each section as markdown string
4. Implement `writeSpecArtifact(planDir, artifact): Promise<string>`
   - `mkdir -p` planDir, write spec.md, return path
5. Implement `readSpecArtifact(specPath): Promise<SpecArtifact | null>`
   - Read file, parse frontmatter block, extract sections by `## Heading` boundaries
   - Parse Decision Log table rows into `SpecDecision[]`
   - Parse Acceptance Criteria checkboxes into `string[]`
   - Return `null` if file not found or parse fails
6. Export all three from module
7. Run `npm run build` to verify compile

## Todo

- [ ] Create `src/commands/build/spec-artifact-writer.ts`
- [ ] Implement `SpecArtifact` + `SpecDecision` interfaces
- [ ] Implement `formatSpecArtifact()` with all 8 sections
- [ ] Implement `writeSpecArtifact()` with mkdir + writeFile
- [ ] Implement `readSpecArtifact()` with graceful null on failure
- [ ] Verify `npm run build` passes (no TypeScript errors)

## Success Criteria

- `writeSpecArtifact('plans/260414-test', artifact)` creates `plans/260414-test/spec.md` with correct format
- `readSpecArtifact(path)` returns structured `SpecArtifact` from written file
- Round-trip: write → read → compare produces equal data
- Module is under 200 lines
- No new dependencies introduced (node built-ins only)
