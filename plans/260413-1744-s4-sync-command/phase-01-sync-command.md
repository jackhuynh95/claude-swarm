# Phase 1 — Create sync-command.ts

**Priority**: High
**Status**: Complete
**File**: `src/commands/sync/sync-command.ts`

## Context

- [smart-pull.ts](../../src/commands/sync/smart-pull.ts) — `smartPull(opts: SmartPullOptions): Promise<SmartPullResult>`
- [smart-push.ts](../../src/commands/sync/smart-push.ts) — `smartPush(opts: SmartPushOptions): Promise<SmartPushResult>`
- [alignment-checker.ts](../../src/commands/sync/alignment-checker.ts) — `checkAlignment(opts: AlignmentCheckOptions): Promise<AlignmentResult>`
- [build-command.ts](../../src/commands/build/build-command.ts) — Reference pattern for command registration

## Key Insights

- All three functions accept `vaultPath`, `brainPath`, `projectName` — derive from CLI flags or defaults
- `smartPush` additionally requires `context` (string) — mandatory for `sync push`
- `checkAlignment` additionally accepts `autoUpdate` (boolean)
- `--force` means dumb copy (skip Claude classification) — not yet implemented in the underlying functions. For now, `--force` logs a warning and falls through to normal smart sync. Can be implemented later as a `forceCopy` option on each function.
- `ProjectConfig` in `config-resolver.ts` has a `vault` field but no `brain` field — add `brain` field to `ProjectConfig`
- Default paths: vault = `./obsidian-vault`, brain = `../second-brain`

## Requirements

### Functional
- `claude-swarm sync pull` — smart-pull from project vault to second-brain
- `claude-swarm sync pull --project medusa` — filter to one project
- `claude-swarm sync push --project medusa --context "task description"` — smart-push with context
- `claude-swarm sync push --context @issue-42.md` — context from file (read file contents)
- `claude-swarm sync check` — alignment check all vaults
- `claude-swarm sync check --project medusa` — one project
- `--dry-run` on all subcommands
- `--force` flag (stub: warn + fallback to smart sync for now)

### Non-Functional
- Follow commander.js subcommand pattern from `build-command.ts`
- Keep under 200 lines — split helpers if needed
- Console output: summary table after each operation

## Architecture

```
sync (Command)
├── pull   → calls smartPull()
├── push   → calls smartPush()
└── check  → calls checkAlignment()
```

### Path Resolution Order
1. `--vault` / `--brain` CLI flags (absolute or relative)
2. `.claude-swarm.json` config: `vault`, `brain` fields
3. Defaults: `./obsidian-vault`, `../second-brain`

### `--project` Flag
- When provided with `pull`: sets `projectName` for classifier context
- When provided with `push`/`check`: sets `projectName` for frontmatter/logging
- Default: basename of `process.cwd()`

### `--context` Flag (push only)
- Plain string: use as-is
- Starts with `@`: read file contents as context
- Required for `sync push` — commander marks it mandatory

### `--force` Flag
- For now: log `[sync] --force not yet implemented, using smart sync` and proceed normally
- Future: add `force?: boolean` to SmartPullOptions/SmartPushOptions to bypass Claude classification

## Related Code Files

### Modify
- `src/config-resolver.ts` — Add `brain?: string` to `ProjectConfig` interface

### Create
- `src/commands/sync/sync-command.ts` — New CLI command module

## Implementation Steps

1. Add `brain?: string` to `ProjectConfig` in `src/config-resolver.ts`
2. Create `src/commands/sync/sync-command.ts`:
   a. Import `Command` from commander
   b. Import `smartPull`, `smartPush`, `checkAlignment` from sibling modules
   c. Import `loadProjectConfig` from config-resolver
   d. Create helper: `resolvePaths(opts)` — resolve vault/brain/project from flags + config + defaults
   e. Create helper: `resolveContext(ctx: string)` — if starts with `@`, read file, else return string
   f. Register `syncCommand = new Command('sync')`
   g. Add `sync pull` subcommand with `--project`, `--vault`, `--brain`, `--dry-run`, `--force`
   h. Add `sync push` subcommand with `--project`, `--vault`, `--brain`, `--context <ctx>` (required), `--dry-run`, `--force`
   i. Add `sync check` subcommand with `--project`, `--vault`, `--brain`, `--dry-run`, `--auto-update`
   j. Each action: resolve paths, call function, print summary
3. Print summary after each operation:
   - Pull: `Promoted: N | Skipped: N`
   - Push: `Injected: N | Skipped: N`
   - Check: `Total: N | Aligned: N | Drifted: N`

## Pseudocode

```typescript
import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { smartPull } from './smart-pull.js';
import { smartPush } from './smart-push.js';
import { checkAlignment } from './alignment-checker.js';
import { loadProjectConfig } from '../../config-resolver.js';

function resolvePaths(opts: { vault?: string; brain?: string; project?: string }) {
  const config = loadProjectConfig();
  return {
    vaultPath: resolve(opts.vault ?? config.vault ?? './obsidian-vault'),
    brainPath: resolve(opts.brain ?? config.brain ?? '../second-brain'),
    projectName: opts.project ?? basename(process.cwd()),
  };
}

function resolveContext(ctx: string): string {
  if (ctx.startsWith('@')) {
    const filePath = ctx.slice(1);
    if (!existsSync(filePath)) throw new Error(`Context file not found: ${filePath}`);
    return readFileSync(filePath, 'utf8');
  }
  return ctx;
}

export const syncCommand = new Command('sync')
  .description('Smart vault sync (secondary/global scope)');

syncCommand.command('pull')
  .description('Promote project vault notes to second-brain')
  .option('--project <name>', 'Project name')
  .option('--vault <path>', 'Project vault path')
  .option('--brain <path>', 'Second-brain path')
  .option('--dry-run', 'Preview without writing', false)
  .option('--force', 'Skip classification (dumb copy)', false)
  .action(async (opts) => {
    if (opts.force) console.log('[sync] --force not yet implemented, using smart sync');
    const paths = resolvePaths(opts);
    const result = await smartPull({ ...paths, dryRun: opts.dryRun });
    console.log(`\nPromoted: ${result.promoted} | Skipped: ${result.skipped}`);
  });

// sync push and sync check follow same pattern...
```

## Todo

- [x] Add `brain?: string` to `ProjectConfig`
- [x] Create `src/commands/sync/sync-command.ts`
- [x] Wire `sync pull` → `smartPull()`
- [x] Wire `sync push` → `smartPush()` (with context resolution)
- [x] Wire `sync check` → `checkAlignment()`
- [x] Add `--dry-run` to all subcommands
- [x] Add `--force` stub to pull/push
- [x] Print summary table after each operation

**Phase Status**: All todos complete. Implementation verified.

## Success Criteria

- `claude-swarm sync pull --dry-run` runs without error, prints summary
- `claude-swarm sync push --context "test" --dry-run` runs without error
- `claude-swarm sync check --dry-run` runs without error
- TypeScript compiles clean (`npx tsc --noEmit`)
- Under 200 lines

## Risk Assessment

- **Low**: `--force` is stubbed, not fully implemented — acceptable for S4 scope
- **Low**: No vault exists on disk during dev — dry-run handles gracefully (underlying functions return empty results)
