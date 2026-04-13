---
phase: 2
status: complete
priority: high
effort: low
---

# Phase 2 — Wire epic-executor to inject vault context before plan/cook

## Context

- `src/commands/build/epic-executor.ts` — roadmap-loader execution engine
- Currently has `vaultPath` option (line 48) but only uses it for lesson CAPTURE (cook-lesson-extractor)
- Does NOT inject vault context before `/ck:plan` or `/ck:cook` prompts
- Phase 1 exports `loadVaultContext(vaultPath, { title, description })` — generic API ready

## Key Insight

The epic-executor already has `vaultPath` and task title/description available. It just needs to call `loadVaultContext` before building the plan/cook prompt and prepend the context.

## Requirements

### Functional
- Before `/ck:plan` invocation: call `loadVaultContext(vaultPath, { title: task.title, description: task.description })`
- Prepend vault context to the plan prompt
- Before `/ck:cook` invocation: same vault context injection
- Local-first: only reads project vault, no global/shared notes

### Non-functional
- Best-effort — empty context on failure, never blocks pipeline
- No new dependencies

## Related Code Files

**Modify:**
- `src/commands/build/epic-executor.ts` — add vault context injection before plan and cook phases

**Import:**
- `src/commands/watch/phases/vault-context-loader.ts` — `loadVaultContext`

## Implementation Steps

1. **Import `loadVaultContext`** in `epic-executor.ts`:
   ```ts
   import { loadVaultContext } from '../watch/phases/vault-context-loader.js';
   ```

2. **Find the plan prompt construction** in `executeFromRoadmap()` — locate where `/ck:plan` prompt is built. Call `loadVaultContext(vaultPath, { title: task.title, description: task.description })` and prepend result to prompt.

3. **Find the cook prompt construction** — locate where `/ck:cook` prompt is built. Same injection.

4. **Guard with try/catch** — vault context is best-effort. On any error, proceed with empty context string.

## Todo

- [x] Import loadVaultContext in epic-executor.ts
- [x] Inject vault context before /ck:plan prompt
- [x] Inject vault context before /ck:cook prompt
- [x] Compile check

## Success Criteria

- epic-executor reads Knowledge/ + Notes/ before planning each task
- Vault context appears in plan/cook prompts
- Pipeline doesn't break when vault is missing or empty
- Compiles cleanly

## Risk Assessment

- **epic-executor is a large file** — make minimal, surgical changes. Only add import + 2 injection points.
- **Prompt size**: vault context is capped at 3000 chars — negligible vs full prompt.
