---
phase: 3
priority: high
status: complete
---

# Phase 3: CLI Wiring

## Context

- [src/index.ts](../../src/index.ts) — CLI entry point, commander setup
- [watch-command.ts](../../src/commands/watch/watch-command.ts) — pattern for subcommand registration
- [Phase 1](./phase-01-roadmap-generator.md) — `generateRoadmap()` 
- [Phase 2](./phase-02-from-scratch-pipeline.md) — `fromScratch()`

## Overview

Create `src/commands/build/build-command.ts` as the subcommand router for `claude-swarm build`, then register it in `src/index.ts`.

## Related Code Files

**Create:**
- `src/commands/build/build-command.ts`

**Modify:**
- `src/index.ts` — add buildCommand import + registration

## Implementation Steps

### 1. Build command with subcommands

```typescript
// src/commands/build/build-command.ts
import { Command } from 'commander';
import { generateRoadmap } from './roadmap-generator.js';
import { fromScratch } from './from-scratch-pipeline.js';

export const buildCommand = new Command('build')
  .description('Generate roadmaps, create issues, and execute implementation pipelines');
```

### 2. `build generate` subcommand

```typescript
buildCommand
  .command('generate <input>')
  .description('Generate a structured roadmap from a topic or @file')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics (default: auto)', parseInt)
  .option('--dry-run', 'Print roadmap to stdout without saving', false)
  .option('--output-dir <dir>', 'Output directory', 'docs')
  .action(async (input, opts) => {
    const result = await generateRoadmap({
      input,
      context: opts.context,
      epics: opts.epics,
      dryRun: opts.dryRun,
      outputDir: opts.outputDir,
    });
    if (!opts.dryRun) {
      console.log(`Roadmap saved to: ${result.roadmapPath}`);
    }
  });
```

### 3. `build from-scratch` subcommand

```typescript
buildCommand
  .command('from-scratch <input>')
  .description('One-liner: generate roadmap → create issues → execute epics')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics', parseInt)
  .option('--auto', 'Enable auto mode for all steps', false)
  .option('--budget <n>', 'Max USD budget per step', parseFloat)
  .option('--dry-run', 'Generate roadmap only, skip init and run', false)
  .action(async (input, opts) => {
    await fromScratch({
      input,
      context: opts.context,
      epics: opts.epics,
      auto: opts.auto,
      budget: opts.budget,
      dryRun: opts.dryRun,
    });
  });
```

### 4. Register in src/index.ts

Add to imports:
```typescript
import { buildCommand } from './commands/build/build-command.js';
```

Add before `program.parse()`:
```typescript
program.addCommand(buildCommand);
```

### 5. Placeholder subcommands for future phases

Add stub commands that print "not yet implemented" messages:

- `build init <roadmap>` — "Phase 1: Roadmap Parser — not yet implemented"
- `build run` — "Phase 3: Epic Executor — not yet implemented"  
- `build status` — "Phase 4: Build Status — not yet implemented"

These stubs set up the CLI surface so users see what's coming without errors.

## Todo

- [ ] Create `src/commands/build/build-command.ts`
- [ ] Wire `generate` subcommand → `generateRoadmap()`
- [ ] Wire `from-scratch` subcommand → `fromScratch()`
- [ ] Add stub subcommands: init, run, status
- [ ] Modify `src/index.ts` — import and register buildCommand
- [ ] Verify: `claude-swarm build --help` shows all subcommands
- [ ] Verify: `claude-swarm build generate --help` shows options
- [ ] Compile check: `npm run build` passes

## Success Criteria

- `claude-swarm build --help` lists: generate, from-scratch, init, run, status
- `claude-swarm build generate "topic"` calls generateRoadmap
- `claude-swarm build generate "topic" --context @file --epics 3 --dry-run` passes all options
- `claude-swarm build from-scratch "topic" --auto --budget 20` calls fromScratch
- `claude-swarm build init` / `run` / `status` print "not yet implemented"
- `npm run build` compiles without errors

## Risk Assessment

- Low risk — standard commander.js subcommand wiring
- Must ensure `.js` extensions in imports for ESM compatibility
