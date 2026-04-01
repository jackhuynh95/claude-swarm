---
phase: 5
status: complete
priority: medium
effort: medium
---

# Phase 5 — Searchable Plan/Run/Review Index

## Overview

Create a search command that finds plans, run records, and review files by keyword. Scans filesystem (plans/, obsidian-vault/Review/Runs/) + TaskRegistry.

## Architecture

```
claude-swarm status --search "auth"

▸ Search: "auth" (5 results)

  Plans:
    plans/260401-2034-phase-4-post-ship-phases/plan.md
      "...Add user auth verification..."

  Runs:
    .ck-tasks.json → run-42-1711929600000
      Issue #42: "Add user auth" — completed

  Reviews:
    obsidian-vault/Review/Runs/2026-04-01-issue-42.md
      "...auth endpoint verified..."
```

## Related Code Files

**Create:**
- `src/commands/status/search-index.ts`

**Modify:**
- `src/commands/status/status-command.ts` — add --search flag

## Implementation Steps

1. Create `search-index.ts`:
   - `searchPlans(query, plansDir)` — glob `plans/**/plan.md` + `plans/**/*.md`, grep for query, return file + context snippet
   - `searchRuns(query, registry)` — filter TaskRegistry tasks by title/exitMessage containing query
   - `searchReviews(query, vaultPath)` — glob `Review/Runs/*.md`, grep for query
   - `searchAll(query, config)` — aggregate all three, deduplicate, return grouped results

2. Wire into status command as `--search <query>`:
   - Read plans from `./plans/`
   - Read runs from TaskRegistry
   - Read reviews from obsidian-vault path (default `./obsidian-vault/`)
   - Show max 3 results per category with context snippet (±1 line)
   - Use chalk.dim for file paths, chalk.yellow for matched text

3. Keep search simple: case-insensitive substring match. No indexing, no ranking. Files are small enough for direct grep.

## Success Criteria

- [x] `--search <query>` returns grouped results from plans, runs, reviews
- [x] Context snippets shown with highlighted match
- [x] Gracefully handles missing directories (no plans yet, no vault)
