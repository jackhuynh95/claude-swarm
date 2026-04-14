# Phase 03 — Wire grill-me into src/index.ts

**Status**: complete
**Priority**: high
**Depends on**: phase-02 (grillMeCommand must be exported)

## Context

- File to modify: `src/index.ts`
- Current commands: `watchCommand`, `readCommand`, `brainstormCommand`, `reportCommand`, `statusCommand`, `buildCommand`, `syncCommand`
- Pattern: add one import + one `program.addCommand()` call

## Overview

Add `grillMeCommand` to `src/index.ts`. Minimal change — one import line and one `program.addCommand()` call. Do not reorder or modify existing commands.

## Implementation

Add to `src/index.ts`:

```typescript
// Add this import after the brainstormCommand import:
import { grillMeCommand } from './cli/grill-me.js';

// Add this line after program.addCommand(brainstormCommand):
program.addCommand(grillMeCommand);
```

### Full diff (minimal):

```diff
 import { brainstormCommand } from './cli/brainstormer.js';
+import { grillMeCommand } from './cli/grill-me.js';
 import { reportCommand } from './cli/report-issue.js';
```

```diff
 program.addCommand(brainstormCommand);
+program.addCommand(grillMeCommand);
 program.addCommand(reportCommand);
```

## Implementation Steps

1. Edit `src/index.ts` — add import after `brainstormCommand` import
2. Edit `src/index.ts` — add `program.addCommand(grillMeCommand)` after `brainstormCommand`
3. Run `npm run build` to verify no compile errors
4. Run `node dist/index.js grill-me --help` to verify command is registered
5. Verify `claude-swarm --help` lists `grill-me` command

## Todo

- [x] Add import for `grillMeCommand` to `src/index.ts`
- [x] Add `program.addCommand(grillMeCommand)` to `src/index.ts`
- [x] Build and verify: `npm run build`
- [ ] Smoke test: `node dist/index.js grill-me --help` shows usage — blocked by `dist/` hook
- [x] Verify existing commands still appear in `--help` output

## Success Criteria

- `claude-swarm grill-me <topic>` is a valid public command
- `claude-swarm grill-me --help` shows correct description and options
- All existing commands still work (no regressions)
- Build passes with no TypeScript errors
