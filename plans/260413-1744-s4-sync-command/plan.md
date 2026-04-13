# S4 — Shared Sync CLI Command

**Status**: Complete
**Track**: Secondary (optional global/shared sync)
**Created**: 2026-04-13
**Phase**: S4 from Smart Vault Sync roadmap
**Depends on**: S1 (smart-pull), S2 (smart-push), S3 (alignment-checker) — all complete

---

## Goal

Wire `smart-pull`, `smart-push`, and `alignment-checker` into a single `claude-swarm sync` CLI subcommand. Keep secondary/global scope clearly separate from primary mode.

## Scope

- Create `src/commands/sync/sync-command.ts`
- Register in `src/index.ts`
- Three subcommands: `sync pull`, `sync push`, `sync check`
- Cross-cutting flags: `--dry-run`, `--force`, `--project`, `--vault`, `--brain`

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | [Create sync-command.ts](phase-01-sync-command.md) | `src/commands/sync/sync-command.ts` | ✓ Complete |
| 2 | [Register in CLI](phase-02-register-cli.md) | `src/index.ts` | ✓ Complete |

## Cook Command

```bash
/ck:cook --auto plans/260413-1744-s4-sync-command/plan.md
```
