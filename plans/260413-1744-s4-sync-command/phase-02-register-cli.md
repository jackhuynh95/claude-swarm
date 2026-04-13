# Phase 2 — Register sync command in CLI

**Priority**: High
**Status**: Complete
**File**: `src/index.ts`

## Context

- [src/index.ts](../../src/index.ts) — Main CLI entry, line 28: `program.addCommand(buildCommand)`
- [Phase 1](phase-01-sync-command.md) — Creates `syncCommand` export

## Implementation Steps

1. Add import: `import { syncCommand } from './commands/sync/sync-command.js';`
2. Add registration: `program.addCommand(syncCommand);` after `buildCommand` line
3. Verify: `npx tsc --noEmit` passes

## Related Code Files

### Modify
- `src/index.ts` — Add 2 lines (import + addCommand)

## Todo

- [x] Import `syncCommand` in `src/index.ts`
- [x] Register with `program.addCommand(syncCommand)`
- [x] Verify TypeScript compilation

**Phase Status**: All todos complete. CLI registration verified.

## Success Criteria

- `claude-swarm sync --help` shows pull/push/check subcommands
- `claude-swarm --help` lists `sync` in command list
