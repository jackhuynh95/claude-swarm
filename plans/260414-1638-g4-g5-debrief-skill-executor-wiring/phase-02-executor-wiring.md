---
phase: 02
title: "Wire Debrief Into epic-executor.ts"
status: pending
priority: high
---

# Phase 02 — Wire Debrief Into Builder Executor

**Goal**: Add a best-effort debrief step to `executeFromRoadmap()` in `src/commands/build/epic-executor.ts` after each successful task (post-commit, post-knowledge-extraction). Extend `Step` type and `STEP_TO_PHASE` to support `'debrief'`. Write debrief artifact path to console.

## Context Links

- Source file: `src/commands/build/epic-executor.ts` (540 lines, fully read)
- Debrief skill: `.claude/skills/debrief/SKILL.md` (created in Phase 01)
- Pattern to follow: `extractLessonsFromCook()` call at line ~464 (best-effort, swallowed)

## Key Locations in epic-executor.ts

| Line | What | Note |
|------|------|------|
| 15 | `type Step = ...` | Add `'debrief'` to union |
| 18–25 | `STEP_TO_PHASE` | Add `debrief: 'cook'` (uses sonnet via cook routing) |
| 460–474 | Lesson capture block | Pattern: `try { ... } catch { /* swallow */ }` |
| 478–481 | Commit step | Debrief inserts AFTER this |
| 483–496 | Knowledge extraction block | Debrief inserts AFTER this |
| 498 | `completed++` | Debrief runs before this |

## Changes

### 1. Extend `Step` type (line 15)

```typescript
// Before
type Step = 'plan' | 'plan-red-team' | 'cook' | 'test' | 'predict' | 'ship';

// After
type Step = 'plan' | 'plan-red-team' | 'cook' | 'test' | 'predict' | 'ship' | 'debrief';
```

### 2. Extend `STEP_TO_PHASE` (lines 18–25)

```typescript
const STEP_TO_PHASE: Record<Step, PhaseType> = {
  plan:            'plan',
  'plan-red-team': 'plan_redteam',
  cook:            'cook',
  test:            'test',
  predict:         'predict',
  ship:            'ship',
  debrief:         'cook',   // reuse cook model routing (sonnet)
};
```

### 3. Add helper `findActivePlanArtifacts()` (after `loadRoadmapTasks`, before `executeFromRoadmap`)

Inline, under 25 lines, best-effort:

```typescript
/** Best-effort: find most recently modified plan dir and return spec.md/plan.md paths */
function findActivePlanArtifacts(): { specPath: string; planPath: string } {
  try {
    const plansDir = join(process.cwd(), 'plans');
    const dirs = execSync(`ls -dt ${plansDir}/2* 2>/dev/null | head -1`, { encoding: 'utf-8' }).trim();
    if (!dirs) return { specPath: 'not found', planPath: 'not found' };
    const specPath = join(dirs, 'spec.md');
    const planPath = join(dirs, 'plan.md');
    const { existsSync } = await import('node:fs');  // use sync import
    return {
      specPath: existsSync(specPath) ? specPath : 'not found',
      planPath: existsSync(planPath) ? planPath : 'not found',
    };
  } catch {
    return { specPath: 'not found', planPath: 'not found' };
  }
}
```

**Note**: Use `existsSync` from `node:fs` (already available via Node). Since `epic-executor.ts` uses `execSync` from `node:child_process`, import `existsSync` from `node:fs` at top.

### 4. Insert debrief step after knowledge extraction block (after line ~496)

Location: after the `} catch { /* swallow — best-effort */ }` that closes the knowledge extraction block, before `completed++`:

```typescript
      // Step 3.6: Debrief — best-effort, never blocks pipeline
      try {
        const { specPath, planPath } = findActivePlanArtifacts();
        const cookSummary = result.stdout.slice(0, 500).replace(/\n/g, ' ');
        const debriefPrompt = [
          `/debrief`,
          `Task: ${issue.title}`,
          `Phase: ${epic.title}`,
          `Roadmap: ${roadmapPath}`,
          `Cook summary: ${cookSummary}`,
          specPath !== 'not found' ? `Spec: @${specPath}` : `Spec: not found`,
          planPath !== 'not found' ? `Plan: @${planPath}` : `Plan: not found`,
        ].join('. ');
        const debriefResult = await runStep('debrief', debriefPrompt, opts, configModels);
        if (debriefResult.success) {
          // Extract artifact path from output (debrief skill prints the path)
          const match = debriefResult.stdout.match(/plans\/reports\/debrief[^\s]+\.md/);
          if (match) console.log(chalk.dim(`    debrief → ${match[0]}`));
        }
      } catch { /* swallow */ }
```

## Files to Modify

- `src/commands/build/epic-executor.ts`
  - Add `'debrief'` to `Step` type
  - Add `debrief: 'cook'` to `STEP_TO_PHASE`
  - Add `existsSync` to `node:fs` import at top
  - Add `findActivePlanArtifacts()` function
  - Add debrief step block after knowledge extraction in `executeFromRoadmap()`

## Todo

- [ ] Add `'debrief'` to `Step` union (line 15)
- [ ] Add `debrief: 'cook'` to `STEP_TO_PHASE` (lines 18–25)
- [ ] Add `existsSync` import from `node:fs`
- [ ] Add `findActivePlanArtifacts()` helper function
- [ ] Insert debrief step block after knowledge extraction (before `completed++`)
- [ ] Run `npx tsc --noEmit` to verify no compile errors

## Success Criteria

- `npx tsc --noEmit` passes with no errors
- `type Step` includes `'debrief'`
- `STEP_TO_PHASE.debrief === 'cook'`
- Debrief step runs after commit + knowledge extraction for each successful task
- Debrief step is wrapped in `try/catch` and never breaks the pipeline
- Console shows debrief artifact path when debrief skill writes it

## Risk

- `findActivePlanArtifacts()` may return wrong dir if multiple plans exist — acceptable for v1 (best-effort)
- Debrief skill may not output the artifact path in a parseable format — console log is optional, artifact still written by the skill
