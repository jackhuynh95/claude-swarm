# Phase 02 — Vault Mirror + grill-me CLI Wire

**Status**: pending
**Priority**: high
**Depends on**: phase-01 (spec-artifact-writer.ts module)

## Context

- Vault structure: `obsidian-vault/Review/Runs/` (confirmed from `obsidian-vault/Review/Runs/.gitkeep`)
- Frontmatter builder: `src/commands/sync/frontmatter-parser.ts` → `buildFrontmatter()`
- grill-me CLI: `src/cli/grill-me.ts` — entry point to hook into
- Knowledge writer pattern: `src/commands/sync/knowledge-writer.ts` (best-effort, never throws)

## Overview

Two deliverables:

1. `mirrorSpecToVault(vaultPath, artifact)` — added to `spec-artifact-writer.ts` — writes a lightweight summary note to `obsidian-vault/Review/Runs/<date>-<slug>.md`
2. Wire into `src/cli/grill-me.ts` — after Claude writes spec.md, detect the spec file and call `mirrorSpecToVault`

**Design invariants**:
- Mirror is best-effort: errors are logged, never propagated
- Mirror writes a summary, not a copy of full spec
- Mirror note format uses `buildFrontmatter` from frontmatter-parser.ts for consistency
- Vault path resolved from config or defaults to `./obsidian-vault`

## mirrorSpecToVault Design

```ts
export async function mirrorSpecToVault(
  vaultPath: string,      // e.g. "./obsidian-vault"
  artifact: SpecArtifact,
): Promise<{ mirrored: boolean; path?: string }> {
  try {
    const dir = join(vaultPath, 'Review', 'Runs');
    await mkdir(dir, { recursive: true });

    const slug = toKebabCase(artifact.topic).slice(0, 50);
    const filename = `${artifact.date}-spec-${slug}.md`;
    const filePath = join(dir, filename);

    const frontmatter = buildFrontmatter({
      date: artifact.date,
      'source-phase': 'plan',
      tags: ['spec', 'grill-me'],
      'synced-at': new Date().toISOString(),
    });

    const body = buildMirrorBody(artifact);
    await writeFile(filePath, frontmatter + body, 'utf8');
    return { mirrored: true, path: filePath };
  } catch (err) {
    console.error('[spec-artifact-writer] vault mirror failed:', err);
    return { mirrored: false };
  }
}
```

Mirror body format (summary only — not full spec):
```markdown
# Spec: <topic>

**Status**: <status> | **Model**: <model>

## Summary
<summary paragraph>

## Decisions Made
- Decision 1: chose X over Y — <rationale>
- Decision 2: ...

## Open Questions
- ...

## Follow-Up Clues
- Acceptance criteria count: N
- Risks: <risk count>
- Next step: /ck:plan --fast <topic>
```

## grill-me CLI Wire

After the `invokeClaudePhase` call in `executeGrillMe` succeeds, detect the spec.md written by Claude and call the mirror:

```ts
// In executeGrillMe() after result.success check:
if (options.planDir) {
  const specPath = join(options.planDir, 'spec.md');
  const artifact = await readSpecArtifact(specPath);
  if (artifact) {
    const vaultPath = resolveVaultPath();  // see below
    await mirrorSpecToVault(vaultPath, artifact);
    console.log(`Spec mirrored to vault: obsidian-vault/Review/Runs/`);
  }
}
```

`resolveVaultPath()` — simple helper in grill-me.ts:
```ts
function resolveVaultPath(): string {
  return process.env['VAULT_PATH'] ?? join(process.cwd(), 'obsidian-vault');
}
```

No config file lookup for v1 — env var or default. Keeps it simple.

## Related Code Files

| Action | File |
|--------|------|
| Modify | `src/commands/build/spec-artifact-writer.ts` (add `mirrorSpecToVault`) |
| Modify | `src/cli/grill-me.ts` (add vault mirror call post-execution) |
| Read (patterns) | `src/commands/sync/frontmatter-parser.ts` |
| Read (patterns) | `src/commands/watch/phases/journal-writer.ts` |

## Implementation Steps

1. In `src/commands/build/spec-artifact-writer.ts`:
   - Add `toKebabCase` helper (copy pattern from knowledge-writer.ts)
   - Add `buildMirrorBody(artifact): string` — builds the lightweight summary markdown
   - Add `mirrorSpecToVault(vaultPath, artifact)` — best-effort write to `Review/Runs/`
   - Import `buildFrontmatter` from `../../commands/sync/frontmatter-parser.js`
2. In `src/cli/grill-me.ts`:
   - Import `readSpecArtifact`, `mirrorSpecToVault` from `../commands/build/spec-artifact-writer.js`
   - After `result.success` block: if `options.planDir` provided, call `readSpecArtifact` + `mirrorSpecToVault`
   - Add `resolveVaultPath()` helper function
   - Print confirmation line: `Spec mirrored → obsidian-vault/Review/Runs/<filename>`
3. Run `npm run build` — verify no TypeScript errors
4. Manual smoke test: call `grill-me.ts` with a `--plan-dir` pointing to a dir with an existing spec.md, verify vault file appears

## Todo

- [ ] Add `mirrorSpecToVault()` to `spec-artifact-writer.ts`
- [ ] Add `buildMirrorBody()` helper to `spec-artifact-writer.ts`
- [ ] Import and call mirror in `src/cli/grill-me.ts` post-execution
- [ ] Add `resolveVaultPath()` to `src/cli/grill-me.ts`
- [ ] Verify `obsidian-vault/Review/Runs/` dir is created on first mirror
- [ ] Run `npm run build` — no errors
- [ ] Smoke test: spec.md in a test plan dir → confirm vault file created

## Success Criteria

- After `claude-swarm grill-me --plan-dir plans/xxx "topic"`, vault file `obsidian-vault/Review/Runs/<date>-spec-<slug>.md` exists
- Mirror failure does not crash or exit-code the CLI
- Vault note contains: summary, decisions, open questions, follow-up clues
- All TypeScript compiles cleanly
- `spec-artifact-writer.ts` stays under 200 lines total (phases 01 + 02 combined)

## Risk

- Claude-written spec.md may have slightly different heading names than what `readSpecArtifact` expects. Mitigation: make section parser case-insensitive and trim-tolerant. Return `null` on total parse failure; mirror is skipped but not fatal.
