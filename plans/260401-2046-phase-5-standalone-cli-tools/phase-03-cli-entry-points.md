---
phase: 3
priority: high
status: done
effort: medium
---

# Phase 3 — CLI Entry Points & Report-Issue Standalone

## Overview

Wire all standalone commands into `src/index.ts`, create `report-issue.ts` standalone mode, and add `bin` field to `package.json` for global CLI access.

## Context Links

- CLI entry: `src/index.ts` (currently only has `watchCommand`)
- Slack reporter pattern: `src/commands/watch/phases/slack-reporter.ts`
- Package config: `package.json`

## Requirements

### Report-Issue Standalone (`claude-swarm report`)
- Accept `--repo` (required) — target repo
- Accept `--issue` (required) — issue number to report on
- Accept `--channel` (optional) — Slack channel override
- Accept `--model` (optional) — model override
- Reuse prompt-building pattern from `slack-reporter.ts` but fetch issue data from GitHub API instead of receiving ClassifiedIssue

### CLI Registration
- Register all 3 standalone commands in `src/index.ts`
- Add `bin` field to `package.json` pointing to compiled output
- Ensure commands work both via `bun src/index.ts` and `npx claude-swarm`

## Architecture

```typescript
// src/cli/report-issue.ts
export const reportCommand = new Command('report')
  .description('Send Slack report for a GitHub issue')
  .requiredOption('-r, --repo <owner/repo>', 'Repository')
  .requiredOption('-i, --issue <number>', 'Issue number')
  .option('-c, --channel <channel>', 'Slack channel override')
  .option('-m, --model <model>', 'Model override')
  .action(executeReport);
```

Flow:
1. Fetch issue from GitHub API via Octokit
2. Build report prompt (similar to slack-reporter.ts pattern)
3. Invoke via `invokeClaudePhase('slack_report')` with haiku
4. Display formatted output

## Related Code Files

**Create:**
- `src/cli/report-issue.ts` (~70 lines)

**Modify:**
- `src/index.ts` — import and register all 3 commands
- `package.json` — add `bin` field

## Implementation Steps

1. Create `src/cli/report-issue.ts` with commander Command export
2. Implement GitHub issue fetch via Octokit (reuse existing dep)
3. Build Slack report prompt from fetched issue data
4. Invoke via `invokeClaudePhase('slack_report', modelOverride, true)`
5. Register all 3 CLI commands in `src/index.ts`:
   ```typescript
   import { readCommand } from './cli/slack-reader.js';
   import { brainstormCommand } from './cli/brainstormer.js';
   import { reportCommand } from './cli/report-issue.js';
   program.addCommand(readCommand);
   program.addCommand(brainstormCommand);
   program.addCommand(reportCommand);
   ```
6. Add to `package.json`:
   ```json
   "bin": {
     "claude-swarm": "./dist/index.js"
   }
   ```
7. Verify `npm run build` compiles all new files
8. Test: `node dist/index.js read --help`, `brainstorm --help`, `report --help`

## Success Criteria

- [x] `claude-swarm read --help` shows usage
- [x] `claude-swarm brainstorm --help` shows usage
- [x] `claude-swarm report --help` shows usage
- [x] `claude-swarm report --repo owner/repo --issue 1` sends Slack report
- [x] `package.json` has `bin` field
- [x] `npm run build` succeeds with zero errors
- [x] All commands reuse `invokeClaudePhase()` — no duplicate Claude spawning logic
