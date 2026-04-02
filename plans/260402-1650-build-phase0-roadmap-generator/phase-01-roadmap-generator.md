---
phase: 1
priority: high
status: complete
---

# Phase 1: Roadmap Generator

## Context

- [Builder Roadmap](../../docs/implement-roadmap-builder.md) — Phase 0 tasks 0a–0h
- [Claude Invoker](../../src/commands/watch/phases/claude-invoker.ts) — subprocess spawn pattern
- [Model Router](../../src/commands/watch/phases/model-router.ts) — phase config pattern
- [Implement Roadmap](../../docs/implement-roadmap.md) — output format reference

## Overview

Create `src/commands/build/roadmap-generator.ts` that accepts a topic (string or @file), spawns Claude opus to brainstorm scope, and outputs a structured roadmap markdown file.

## Architecture

```
User input (topic string or @file)
  │
  ├── resolve input: string literal vs read file contents
  ├── optionally read --context @file
  ├── build prompt with topic + context + epic count hint
  │
  ▼
Spawn claude CLI subprocess
  │ model: opus, effort: high
  │ prompt: brainstorm roadmap with milestone/epics/issues/sub-issues
  │ output: structured markdown
  │
  ▼
Parse stdout → validate has expected headings/tables
  │
  ▼
Write to docs/implement-roadmap-{slug}.md (or stdout if --dry-run)
```

## Related Code Files

**Create:**
- `src/commands/build/roadmap-generator.ts`

## Implementation Steps

### 1. Input resolver function

```typescript
async function resolveInput(input: string): Promise<string>
```

- If input starts with `@`, strip the prefix and read file at that path
- Otherwise return the string as-is
- Throw if @file doesn't exist

### 2. Slug generator function

```typescript
function toSlug(topic: string): string
```

- Lowercase, replace spaces/special chars with hyphens
- Truncate to ~60 chars
- Remove trailing hyphens

### 3. Prompt builder

Build the Claude prompt that instructs roadmap generation:

```typescript
function buildRoadmapPrompt(opts: {
  topic: string;
  context?: string;
  epics?: number;
}): string
```

The prompt should instruct Claude to output markdown with:
- `# {Title}` heading with date and goal
- `## Architecture` section with file tree
- `## Phase N — {Name}` sections per epic
- Each phase has a table: `| # | Task | Status |` with Pending status
- `## Summary` table at the end
- Follow the exact format of `docs/implement-roadmap-builder.md`

If `epics` is provided, hint "organize into exactly N epics". Otherwise "organize into a sensible number of epics".

### 4. Claude subprocess spawner

```typescript
async function spawnClaudeForRoadmap(prompt: string): Promise<string>
```

- Spawn `claude` CLI with args: `-p`, prompt, `--model`, `opus`, `--output-format`, `text`
- Add `--dangerously-skip-permissions` (read-only brainstorm, no edits needed)
- Timeout: 600s (10 min, opus brainstorm can be slow)
- Capture stdout, return it
- If exit code !== 0 or timeout, throw with stderr

### 5. Main generate function (exported)

```typescript
export async function generateRoadmap(opts: {
  input: string;
  context?: string;
  epics?: number;
  dryRun?: boolean;
  outputDir?: string;
}): Promise<{ roadmapPath: string; content: string }>
```

Flow:
1. `resolveInput(opts.input)` → topic text
2. If `opts.context`, `resolveInput(opts.context)` → context text
3. `buildRoadmapPrompt({ topic, context, epics })`
4. Show spinner: "Generating roadmap..."
5. `spawnClaudeForRoadmap(prompt)` → markdown
6. If `dryRun`: print markdown to stdout, return
7. `toSlug(topic)` → slug
8. Write to `{outputDir}/implement-roadmap-{slug}.md` (default outputDir: `docs/`)
9. Return `{ roadmapPath, content }`

### 6. Use ora for spinner + chalk for colors

- Spinner while Claude is thinking
- Green success message with file path
- Yellow for dry-run output

## Todo

- [ ] Create `src/commands/build/roadmap-generator.ts`
- [ ] Implement `resolveInput()` — handle string vs @file
- [ ] Implement `toSlug()` — kebab-case conversion
- [ ] Implement `buildRoadmapPrompt()` — structured prompt
- [ ] Implement `spawnClaudeForRoadmap()` — subprocess spawn
- [ ] Implement `generateRoadmap()` — main orchestrator
- [ ] Test: string input generates roadmap
- [ ] Test: @file input reads and generates
- [ ] Test: --context adds context to prompt
- [ ] Test: --epics controls epic count in prompt
- [ ] Test: --dry-run prints to stdout without writing file

## Success Criteria

- `generateRoadmap({ input: "Add payment gateway" })` produces valid roadmap markdown
- Output follows implement-roadmap format (headings + tables + status columns)
- @file inputs read file contents correctly
- --context appends additional background to prompt
- --epics N hints epic count to Claude
- --dry-run prints to stdout, does not write file
- File written to `docs/implement-roadmap-{slug}.md`

## Risk Assessment

- Claude output may not exactly match expected format → prompt engineering critical
- Large file inputs may exceed context → truncate at 50K chars with warning
- opus can be slow (2-5 min) → 10 min timeout, spinner feedback
