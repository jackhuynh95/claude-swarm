# Phase 02 — generate-doc.ts

**File**: `src/commands/build/generate-doc.ts`
**Priority**: high
**Status**: pending

## Overview

`generate-doc` is a standalone pipeline (separate from roadmap-generator) that directly spawns Claude with a plain prompt to write `docs/implement-roadmap-*.md`. Add an optional grill-me pre-step before the doc generation.

## Current State

```
Step 1: spawn Claude with plain buildPrompt() → docs/implement-roadmap-{slug}.md
```

## Target State

```
Step 1: /grill-me Clarify scope... (opus)  ← skippable via skipGrillMe
Step 2: spawn Claude with buildPrompt() + spec context → docs/implement-roadmap-{slug}.md
```

## Related Files

- `src/commands/build/generate-doc.ts` — only file touched

## Implementation Steps

1. Add `skipGrillMe?: boolean` to `GenerateDocOptions` interface.

2. Add `grillme: 'claude-opus-4-6'` to a local model constant at top of file (or inline).

3. Add `spawnClaudeStep()` helper — identical to the one in `roadmap-generator.ts`.
   - **DRY consideration**: both files have nearly identical `spawnClaude` and `spawnClaudeStep` patterns. Do NOT refactor a shared utility now (YAGNI). Keep them co-located per file until there are 3+ callsites.

4. In `generateDoc()`, before the spinner:
   ```
   if (!opts.skipGrillMe && !opts.dryRun) {
     const gSpinner = ora('Running grill-me spec interview (opus)...').start();
     const gr = await spawnClaudeStep(
       `/grill-me Clarify scope, assumptions, and decisions for: ${topic}`,
       { model: 'claude-opus-4-6', budget: opts.budget, timeout: opts.timeout },
     );
     if (gr.success) {
       gSpinner.succeed(chalk.green('Grill-me spec complete'));
     } else {
       gSpinner.fail(chalk.red('Grill-me failed'));
       if (gr.stderr) console.error(chalk.dim(gr.stderr.slice(0, 200)));
       throw new Error('generate-doc failed at grill-me step');
     }
   }
   ```

5. Update dry-run block to show grill-me step:
   ```
   if (!opts.skipGrillMe) {
     console.log(chalk.dim(`  0. /grill-me Clarify scope for: ${topic}`));
   }
   console.log(chalk.dim(`  1. Spawn Claude (${opts.model ?? 'opus'}) to generate roadmap doc`));
   ```

## Todo

- [ ] Add `skipGrillMe?: boolean` to `GenerateDocOptions`
- [ ] Add `spawnClaudeStep` helper in generate-doc.ts (same signature as in roadmap-generator.ts)
- [ ] Add grill-me pre-step in `generateDoc()` guarded by `!opts.skipGrillMe && !opts.dryRun`
- [ ] Update dry-run output to show grill-me step
- [ ] Compile check: `npx tsc --noEmit`

## Success Criteria

- `skipGrillMe: true` skips the pre-step, existing behavior preserved
- Default (no flag) runs grill-me before doc generation
- Dry-run shows the grill-me step when flag is not set
