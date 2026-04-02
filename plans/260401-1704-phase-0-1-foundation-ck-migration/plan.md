# Phase 0+1: Foundation + CK v2.14.0 Migration

**Created**: 2026-04-01
**Status**: Complete
**CompletedOn**: 2026-04-02
**Priority**: High
**Mode**: Fast

---

## Overview

Set up the claude-swarm project foundation by initializing the TypeScript project, pulling CK watch daemon source from upstream fork, migrating `/code:*` command references to `/ck:cook`, creating the obsidian-vault skeleton, and configuring GitHub labels for the automation workflow.

## Current State

- Repo forked from `mrgoonie/claudekit-cli` but **no source code exists** — docs/planning only
- No `package.json`, `tsconfig.json`, or `src/` directory
- No upstream git remote configured
- CLAUDE.md and `.claude/` directory exist with rules/skills
- `docs/` has 5 files (roadmap, playbook, budget guide, CLI ref, priorities)
- `obsidian-vault/` does not exist
- GitHub labels not yet configured
- `/code:*` references exist only in docs (not source code)

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 0 | CK v2.14.0 Command Migration | [phase-00-ck-command-migration.md](phase-00-ck-command-migration.md) | Pending |
| 1 | Foundation Setup | [phase-01-foundation-setup.md](phase-01-foundation-setup.md) | Pending |

## Dependencies

- None (this is the first plan)

## Success Criteria

- [ ] All `/code:*` references migrated to `/ck:cook` in docs
- [ ] Node.js/TS project initialized with package.json + tsconfig.json
- [ ] CK watch source pulled from upstream and builds
- [ ] `obsidian-vault/` skeleton created (Daily/, Notes/, Review/Runs/, Decisions/)
- [ ] GitHub labels configured (ready_for_dev, shipped, verified, etc.)
- [ ] `npm run build` or equivalent compiles without errors

## Estimated Effort

- Phase 0: ~30 min (doc edits only)
- Phase 1: ~2-3 hours (project setup, source pull, verification)
