# Phase 4: Design Reviewer

**Priority**: Medium
**Status**: Complete
**File**: `src/commands/watch/phases/design-reviewer.ts`

---

## Overview

Frontend design review phase. Manual trigger only — runs when issue has 'frontend' or 'ui' label (detected by `ClassifiedIssue.flags.designReview`). Posts review findings as comment. Never blocks pipeline.

## Context Links

- Types: `src/commands/watch/types.ts` (RouteFlags.designReview, PhaseType — needs 'design_review' addition)
- Model config: `src/commands/watch/phases/model-router.ts` (needs new 'design_review' entry)
- Router: `src/commands/watch/phases/issue-router.ts` (flags.designReview detection)
- Invoker: `src/commands/watch/phases/claude-invoker.ts`
- Labels: `src/commands/watch/phases/label-manager.ts` (comment posting)

## Key Insights

- **Optional phase** — only runs when `classified.flags.designReview === true`
- Never blocks pipeline — posts findings as advisory comment
- Reviews: UI consistency, responsiveness, accessibility, component patterns
- Uses `verify` phase config temporarily until `design_review` PhaseType is added
- The `frontend` and `ui` labels are already detected by issue-router.ts

## Type Changes Required

**types.ts**: Add `'design_review'` to PhaseType union
**model-router.ts**: Add config entry:
```typescript
design_review: { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] }
```

## Architecture

```
Input: ClassifiedIssue + DesignReviewConfig
  │
  ├─ 1. Check flags.designReview === true
  │     └─ false → skip, return skipped result
  │
  ├─ 2. Build design review prompt:
  │     - Focus on changed frontend files (*.tsx, *.css, *.vue, etc.)
  │     - Review UI patterns, accessibility, responsiveness
  │
  ├─ 3. Invoke via 'design_review' phase (sonnet, 180s)
  │
  ├─ 4. Post findings as advisory comment
  │     (never blocks, never transitions labels)
  │
  └─ 5. Return PhaseResult
```

## Related Code Files

**Modify**:
- `src/commands/watch/types.ts` — add 'design_review' to PhaseType
- `src/commands/watch/phases/model-router.ts` — add design_review config

**Create**: `src/commands/watch/phases/design-reviewer.ts`

## Implementation Steps

1. Add `'design_review'` to PhaseType in types.ts (append to union)
2. Add design_review config in model-router.ts PHASE_CONFIGS
3. Create `design-reviewer.ts` with exports:
   ```typescript
   export interface DesignReviewConfig {
     repo: string;
     autoMode: boolean;
     cwd?: string;
   }
   export interface DesignReviewResult {
     skipped: boolean;
     phaseResult: PhaseResult;
   }
   ```
4. Implement `executeDesignReview(classified, config)`:
   - Check `classified.flags.designReview` — skip if false
   - Build prompt:
     ```
     Review the frontend/UI changes for issue #{number}: {title}
     
     Run `git diff main...HEAD -- '*.tsx' '*.jsx' '*.css' '*.scss' '*.vue' '*.svelte'`
     to see UI-related changes.
     
     Evaluate:
     1. UI consistency with existing patterns
     2. Responsiveness (mobile/tablet/desktop)
     3. Accessibility (ARIA, keyboard nav, contrast)
     4. Component composition (reuse vs duplication)
     5. CSS/styling best practices
     
     Format as a concise review. No verdict needed — this is advisory.
     ```
5. Invoke via `invokeClaudePhase(prompt, 'design_review', modelOverride, autoMode, cwd)`
6. Post findings as comment with `<!-- claude-swarm:design-review -->` marker
7. Never transition labels, never throw errors
8. Return DesignReviewResult

## Todo

- [x] Add 'design_review' to PhaseType in types.ts
- [x] Add design_review config in model-router.ts
- [x] Create design-reviewer.ts file
- [x] Export DesignReviewConfig, DesignReviewResult types
- [x] Implement executeDesignReview() with skip logic
- [x] Build frontend-focused review prompt
- [x] Post advisory comment with bot marker
- [x] Ensure never blocks pipeline
- [x] Verify `npm run build` compiles

## Success Criteria

- Skips cleanly when designReview flag is false
- Reviews frontend-specific file changes
- Posts advisory comment (never blocks)
- New 'design_review' PhaseType registered in types + model-router

## Risk Assessment

- **No frontend files changed**: Git diff returns empty → Claude notes "no UI changes", comment says so
- **Flag false positive**: Label 'frontend' on non-UI issue → review runs but finds nothing, harmless
