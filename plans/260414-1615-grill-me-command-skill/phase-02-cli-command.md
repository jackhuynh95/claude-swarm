# Phase 02 — CLI Command: src/cli/grill-me.ts

**Status**: complete
**Priority**: high
**Depends on**: phase-01 (SKILL.md must exist for the prompt reference to work)

## Context

- Pattern reference: `src/cli/brainstormer.ts` (exact same shape)
- Invoker: `src/commands/watch/phases/claude-invoker.ts` → `invokeClaudePhase()`
- Model: `claude-opus-4-6` (advisor/spec stage, not executor)

## Overview

Create `src/cli/grill-me.ts` following the exact pattern of `src/cli/brainstormer.ts`. The command invokes the repo-local `grill-me` skill via `invokeClaudePhase()`, using Opus model for spec-quality questioning.

## Implementation

```typescript
// src/cli/grill-me.ts
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { invokeClaudePhase } from '../commands/watch/phases/claude-invoker.js';
import type { ClaudeModel } from '../commands/watch/types.js';

interface GrillMeOptions {
  context?: string;
  model?: string;
  planDir?: string;
}

async function executeGrillMe(topic: string, options: GrillMeOptions): Promise<void> {
  const modelOverride = (options.model ?? 'claude-opus-4-6') as ClaudeModel;

  let contextContent = '';
  if (options.context) {
    try {
      contextContent = `\n\nAdditional context from ${options.context}:\n${readFileSync(options.context, 'utf8')}`;
    } catch {
      console.error(`Warning: Could not read context file: ${options.context}`);
    }
  }

  const planDirHint = options.planDir
    ? `\nWrite spec.md to: ${options.planDir}/spec.md`
    : '';

  const prompt = `Use the /grill-me skill to run a spec-interview on this topic.

Topic: ${topic}${contextContent}${planDirHint}

Ask 8-15 sharp questions, force decisions on major choices, consolidate answers, then write plans/<plan-dir>/spec.md and output the handoff command.`;

  console.log(`Grilling: "${topic}"...`);

  const result = await invokeClaudePhase(
    prompt,
    'grill-me',
    undefined,
    { model: modelOverride },
    true,
  );

  if (!result.success) {
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exit(1);
  }

  console.log(result.output ?? '');
}

export const grillMeCommand = new Command('grill-me')
  .description('Run a spec-interview before planning. Writes plans/<plan-dir>/spec.md.')
  .argument('<topic>', 'Topic or request to clarify')
  .option('-c, --context <file>', 'Context file path (e.g. @docs/roadmap.md)')
  .option('-m, --model <model>', 'Model override (default: opus)')
  .option('-d, --plan-dir <dir>', 'Target plan directory for spec.md output')
  .action(executeGrillMe);
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default model | `claude-opus-4-6` | Spec stage = advisor; uses stronger model |
| Invocation | `invokeClaudePhase()` | Same as brainstorm — no new invoker needed |
| Skill name in prompt | `/grill-me` | Maps to repo-local `.claude/skills/grill-me/SKILL.md` |
| No GitHub issue creation | Omitted | grill-me produces spec.md, not issues |

## Implementation Steps

1. Create `src/cli/grill-me.ts` with the code above
2. Run `npm run build` (or `tsc`) to verify no compile errors
3. Confirm `invokeClaudePhase` import path matches brainstormer.ts exactly

## Todo

- [x] Create `src/cli/grill-me.ts`
- [x] Verify `invokeClaudePhase` import resolves correctly
- [x] Verify `ClaudeModel` type import resolves correctly
- [x] Run TypeScript compile — no errors allowed

## Success Criteria

- `src/cli/grill-me.ts` compiles without errors
- `grillMeCommand` is exported and ready to add to `src/index.ts`
- No modifications to `src/cli/brainstormer.ts` or other existing CLI files
