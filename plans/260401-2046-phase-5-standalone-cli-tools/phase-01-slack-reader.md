---
phase: 1
priority: high
status: done
effort: medium
---

# Phase 1 — Slack Reader CLI

## Overview

Create `src/cli/slack-reader.ts` — standalone CLI tool that invokes Claude with /slack-read skill to extract actionable tasks from Slack channels.

## Context Links

- Existing phase type: `slack_read` already in `src/commands/watch/types.ts:42`
- Claude invoker: `src/commands/watch/phases/claude-invoker.ts`
- Model router: `src/commands/watch/phases/model-router.ts`
- CLI entry: `src/index.ts`

## Requirements

- Accept `--channel` (required) — Slack channel name or ID
- Accept `--since` (optional) — time window (e.g., "24h", "7d"), default "24h"
- Accept `--output` (optional) — output format: "text" (default), "json", "issues"
- Accept `--repo` (optional) — when `--output issues`, create GitHub issues from extracted tasks
- Accept `--model` (optional) — override model (default from phase config)
- Non-interactive by default (uses `--dangerously-skip-permissions` like auto mode)

## Architecture

```typescript
// src/cli/slack-reader.ts
export const readCommand = new Command('read')
  .description('Extract tasks from Slack channel')
  .requiredOption('-c, --channel <channel>', 'Slack channel')
  .option('-s, --since <duration>', 'Time window', '24h')
  .option('-o, --output <format>', 'Output: text|json|issues', 'text')
  .option('-r, --repo <owner/repo>', 'Create issues (with --output issues)')
  .option('-m, --model <model>', 'Model override')
  .action(executeSlackRead);
```

Flow:
1. Build prompt instructing Claude to use /slack-read skill on the channel
2. Invoke via `invokeClaudePhase('slack_read')`
3. Parse output based on format
4. If `--output issues` + `--repo`: create GitHub issues via Octokit

## Related Code Files

**Create:**
- `src/cli/slack-reader.ts` (~80 lines)

**Modify:**
- `src/index.ts` — import and `addCommand(readCommand)`

## Implementation Steps

1. Create `src/cli/` directory
2. Create `src/cli/slack-reader.ts` with commander Command export
3. Build prompt that instructs Claude to read Slack channel and extract tasks
4. Use `invokeClaudePhase(prompt, 'slack_read', modelOverride, true)` for execution
5. Add output formatting: plain text passthrough, JSON parse, or issue creation
6. For `--output issues`: use `@octokit/rest` to create issues from extracted tasks
7. Register in `src/index.ts`

## Success Criteria

- [x] `claude-swarm read -c general` runs and returns task list
- [x] `claude-swarm read -c general --output json` returns structured JSON
- [x] `claude-swarm read -c general --output issues --repo owner/repo` creates GitHub issues
- [x] Graceful error on missing channel or auth failure
- [x] TypeScript compiles cleanly
