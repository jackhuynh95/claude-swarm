# Phase 0: CK v2.14.0 Command Migration

**Priority**: High
**Status**: Pending
**Depends on**: None

---

## Overview

Migrate all legacy `/code:*` command references to `/ck:cook` prefix across the codebase. CK v2.14.0 made `/ck:` prefix mandatory to avoid Claude Code built-in command collisions.

## Key Insights

- No TypeScript source code exists yet — migration is **docs-only** at this stage
- 3 files contain `/code:*` references: `docs/implement-roadmap.md`, `docs/execution-playbook.md`, `build-phases.sh`
- The roadmap file documents the migration itself (legacy→new mapping table) — these references are intentional documentation, not code to migrate
- `build-phases.sh` already uses `/ck:cook` and `/ck:plan` — no migration needed there

## Migration Map

| Legacy | New | Notes |
|---|---|---|
| `/code @plan.md` | `/ck:cook @plan.md` | Main cook command |
| `/code:no-test` | `/ck:cook <task> --no-test` | Skip tests |
| `/code:parallel` | `/ck:cook <task> --parallel` | Parallel execution |
| `/code:auto` | `/ck:cook <task> --auto` | Unattended mode |

## Files to Modify

1. **`docs/implement-roadmap.md`** — Update ASCII diagram references (`/code:auto`, `/code:no-test`), update design principle #2, update Phase 3 task #15 description
2. **`docs/execution-playbook.md`** — Already correct (uses `/ck:cook`), no changes needed

## Files to Read (Context)

- `build-phases.sh` — Verify already migrated ✓
- `README.md` — Verify already migrated ✓

## Implementation Steps

1. Read `docs/implement-roadmap.md` fully
2. Replace `/code:auto` → `/ck:cook --auto` in ASCII architecture diagram (lines ~68-70)
3. Replace `/code:no-test` → `/ck:cook --no-test` in ASCII architecture diagram
4. Update Phase 3 task #15 description: `/code:auto` → `/ck:cook --auto`
5. Update design principle #2: replace `/code:auto` with `/ck:cook --auto`
6. Verify no remaining `/code:` references (except the intentional legacy column in the migration table)
7. Run `grep -r '/code:' docs/` to confirm only migration-table references remain

## Todo

- [ ] Update `/code:*` refs in `docs/implement-roadmap.md` ASCII diagram
- [ ] Update Phase 3 task #15 description
- [ ] Update design principle #2
- [ ] Verify no stale `/code:*` refs remain outside migration table

## Success Criteria

- `grep '/code:' docs/implement-roadmap.md` returns only the legacy column in the migration table (lines ~112-115)
- No `/code:` references in any other file except as historical documentation

## Risk Assessment

- **Low risk** — docs-only changes, no runtime impact
- Future phases will create actual TypeScript source that uses `/ck:cook` from the start
