# Phase 1: Foundation Setup

**Priority**: High
**Status**: Pending
**Depends on**: Phase 0 (command migration)

---

## Overview

Initialize the TypeScript project, pull CK watch daemon source from the upstream fork, create the obsidian-vault skeleton, and configure GitHub labels for the automation workflow.

## Key Insights

- The repo was forked from `mrgoonie/claudekit-cli` at the git level but all source code was removed/replaced with docs
- Need to add upstream remote and selectively pull the watch command source files
- CK watch daemon has 15 modules across ~9 states — we keep the daemon core, modify routing later (Phase 2+)
- CLAUDE.md already exists with good project conventions — needs minor updates for v2.0 context
- The upstream CK is a Bun-based TypeScript project using Commander.js for CLI

## Requirements

### Functional
- Node.js/Bun TypeScript project builds and runs
- CK watch daemon source compiles from fork
- obsidian-vault directory structure exists with `.gitkeep` files
- GitHub labels match automation workflow needs

### Non-Functional
- Build time < 10s
- Zero runtime dependencies beyond CK's existing deps
- Git-friendly vault structure (no binary files in vault skeleton)

## Architecture

```
claude-swarm/
├── src/
│   └── commands/
│       └── watch/
│           ├── watch-command.ts      ← from upstream
│           ├── types.ts              ← from upstream
│           └── phases/
│               ├── issue-poller.ts   ← from upstream
│               ├── state-manager.ts  ← from upstream
│               ├── approval-checker.ts ← from upstream
│               ├── worktree-manager.ts ← from upstream
│               ├── claude-invoker.ts   ← from upstream
│               └── implementation-runner.ts ← from upstream
├── obsidian-vault/
│   ├── Daily/         .gitkeep
│   ├── Notes/         .gitkeep
│   ├── Review/
│   │   └── Runs/     .gitkeep
│   └── Decisions/     .gitkeep
├── package.json
├── tsconfig.json
└── .gitignore (update)
```

## Related Code Files

### Files to Create
- `package.json` — project manifest with CK dependencies
- `tsconfig.json` — TypeScript config
- `src/commands/watch/*.ts` — pulled from upstream
- `obsidian-vault/Daily/.gitkeep`
- `obsidian-vault/Notes/.gitkeep`
- `obsidian-vault/Review/Runs/.gitkeep`
- `obsidian-vault/Decisions/.gitkeep`
- `scripts/setup-labels.sh` — GitHub label creation script

### Files to Modify
- `.gitignore` — add `obsidian-vault/.obsidian/` (local Obsidian config)
- `CLAUDE.md` — add v2.0 project context section
- `docs/implement-roadmap.md` — mark Phase 1 tasks as Done

### Files to Read (Context)
- Upstream `mrgoonie/claudekit-cli` package.json — for dependency list
- Upstream watch command source files — for selective pull

## Implementation Steps

### Step 1: Initialize TypeScript Project
1. Create `package.json` with project name `claude-swarm`, type `module`
2. Add dependencies from upstream CK: `commander`, `chalk`, `ora`, `dotenv`, `octokit`
3. Add devDependencies: `typescript`, `@types/node`, `bun-types` (if using Bun)
4. Create `tsconfig.json` targeting ES2022, moduleResolution bundler
5. Run `bun install` or `npm install`

### Step 2: Pull CK Watch Source
1. Add upstream remote: `git remote add upstream https://github.com/mrgoonie/claudekit-cli.git`
2. Fetch upstream: `git fetch upstream --no-tags`
3. Identify watch command files in upstream `src/commands/watch/`
4. Selectively copy watch command files into `src/commands/watch/`
5. Fix import paths if needed for new project structure
6. Verify `bun run build` or `tsc` compiles without errors

### Step 3: Create Obsidian Vault Skeleton
1. Create directories: `obsidian-vault/{Daily,Notes,Review/Runs,Decisions}`
2. Add `.gitkeep` to each leaf directory
3. Update `.gitignore` to exclude `obsidian-vault/.obsidian/` (personal Obsidian settings)

### Step 4: Update CLAUDE.md
1. Add section about CK v2.14.0 command conventions
2. Add note about obsidian-vault purpose and rules
3. Add build/run commands

### Step 5: Setup GitHub Labels
1. Create `scripts/setup-labels.sh` with labels:
   - `ready_for_dev` (green) — approved, ready for automation
   - `shipped` (blue) — PR created by automation
   - `verified` (purple) — independently verified PASS
   - `needs_refix` (red) — verification failed
   - `hard` (orange) — route to opus model
   - `frontend` (teal) — trigger design review
   - `bug` (red) — route to debug-flow
   - `feature` (green) — route to ship-flow
   - `docs` (gray) — route to ship-flow --no-test
   - `chore` (gray) — route to ship-flow --no-test
2. Script uses `gh label create` with `--force` for idempotency
3. Run script against repo

### Step 6: Verify CK Watch Daemon
1. Run `bun run build` — must compile
2. Run `bun run src/commands/watch/watch-command.ts --help` or equivalent — must show help
3. Document any config needed (`.ck.json`, env vars)

## Todo

- [ ] Create package.json + tsconfig.json
- [ ] Install dependencies
- [ ] Add upstream remote and fetch CK source
- [ ] Copy watch command files to src/commands/watch/
- [ ] Fix imports and verify compilation
- [ ] Create obsidian-vault/ skeleton with .gitkeep files
- [ ] Update .gitignore for obsidian vault
- [ ] Update CLAUDE.md with v2.0 context
- [ ] Create scripts/setup-labels.sh
- [ ] Run label setup against GitHub repo
- [ ] Verify CK watch daemon compiles and shows help
- [ ] Update docs/implement-roadmap.md task statuses

## Success Criteria

- `bun run build` (or `tsc`) exits 0
- `ls obsidian-vault/` shows Daily/, Notes/, Review/, Decisions/
- `gh label list` shows ready_for_dev, shipped, verified labels
- No TypeScript compilation errors
- Watch command source files present in `src/commands/watch/`

## Risk Assessment

- **Medium risk**: Upstream CK source may have dependencies or import paths that don't transfer cleanly
  - Mitigation: Selective copy with import path fixes; if too complex, start with minimal watch skeleton and add modules incrementally
- **Low risk**: Upstream may have changed since analysis
  - Mitigation: Pin to specific commit hash when fetching

## Security Considerations

- Don't commit any `.env` files or API keys
- `setup-labels.sh` requires `gh` auth — already handled by existing auth
- No secrets in obsidian-vault skeleton
