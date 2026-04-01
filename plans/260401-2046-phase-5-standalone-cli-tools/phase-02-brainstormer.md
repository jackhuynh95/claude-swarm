---
phase: 2
priority: high
status: done
effort: medium
---

# Phase 2 — Brainstormer CLI

## Overview

Create `src/cli/brainstormer.ts` — standalone CLI tool that invokes Claude with /brainstorm skill and optionally pipes results into GitHub issues.

## Context Links

- Phase type: `brainstorm` already in `src/commands/watch/types.ts:40`
- Claude invoker: `src/commands/watch/phases/claude-invoker.ts`
- CLI pattern: `src/cli/slack-reader.ts` (from Phase 1)

## Requirements

- Accept positional `<topic>` — brainstorm topic/question
- Accept `--context` (optional) — file path for additional context
- Accept `--repo` (optional) — create GitHub issue from best solution
- Accept `--model` (optional) — override model (default: opus for brainstorm)
- Accept `--label` (optional) — labels for created issue (comma-separated)
- Non-interactive by default

## Architecture

```typescript
// src/cli/brainstormer.ts
export const brainstormCommand = new Command('brainstorm')
  .description('Brainstorm solutions and optionally create GitHub issues')
  .argument('<topic>', 'Topic or question to brainstorm')
  .option('-c, --context <file>', 'Context file path')
  .option('-r, --repo <owner/repo>', 'Create issue from result')
  .option('-l, --label <labels>', 'Issue labels (comma-separated)')
  .option('-m, --model <model>', 'Model override')
  .action(executeBrainstorm);
```

Flow:
1. Build prompt with topic + optional context file content
2. Invoke via `invokeClaudePhase('brainstorm')` — uses opus by default
3. Display brainstorm output
4. If `--repo`: parse output for best solution, create GitHub issue with structured body

## Related Code Files

**Create:**
- `src/cli/brainstormer.ts` (~90 lines)

**Modify:**
- `src/index.ts` — import and `addCommand(brainstormCommand)`

## Implementation Steps

1. Create `src/cli/brainstormer.ts` with commander Command export
2. Build brainstorm prompt: include topic, optional context from file
3. Prompt should instruct Claude to use /brainstorm skill with trade-off analysis
4. Use `invokeClaudePhase(prompt, 'brainstorm', modelOverride, true)` for execution
5. Add `--repo` pipeline: extract title + body from brainstorm output, create issue via Octokit
6. Add `--label` support for issue creation
7. Register in `src/index.ts`

## Success Criteria

- [x] `claude-swarm brainstorm "How to handle rate limiting"` runs and shows analysis
- [x] `claude-swarm brainstorm "Auth strategy" --repo owner/repo` creates issue
- [x] `claude-swarm brainstorm "Topic" --context ./spec.md` includes file content
- [x] Issue created with structured body (problem, solutions, trade-offs, recommendation)
- [x] TypeScript compiles cleanly
