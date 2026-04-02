# Builder Tool Implementation Roadmap

**Date**: 2026-04-02
**Goal**: Build `claude-swarm build` CLI command — Thierry's approach in Node.js
**Location**: `src/commands/build/` inside claude-swarm repo

---

## What It Does

```
Human writes spec (Obsidian, markdown, etc.)
     │
     ▼
claude-swarm build init @roadmap.md
     │ parse markdown → create milestone → epics → issues
     ▼
claude-swarm build run --epic 1 --auto
     │ plan → cook → test → ship (per issue)
     ▼
PRs created. Issues closed. Vault journaled.
```

---

## Architecture

```
src/commands/build/
├── build-command.ts        ← CLI entry: subcommand router
├── roadmap-parser.ts       ← Parse markdown → milestone, epics, issues
├── github-hierarchy.ts     ← Create milestone, epics, issues via gh API
├── epic-executor.ts        ← Plan → cook → test → ship per epic
└── build-status.ts         ← Show progress: milestone → epic → issue
```

---

## Phase 1 — Roadmap Parser

**Goal**: Parse a markdown roadmap into structured data.

| # | Task | Status |
|---|---|---|
| 1 | Parse milestone name from `# Title` or `## Milestone:` | Pending |
| 2 | Parse epics from `### Epic N —` headings | Pending |
| 3 | Parse issues from table rows (`\| # \| Task \| Status \|`) | Pending |
| 4 | Parse sub-issues from indented rows under issues | Pending |
| 5 | Output structured JSON: `{ milestone, epics: [{ title, issues: [{ title, subs }] }] }` | Pending |
| 6 | Support both `implement-roadmap.md` format and `implement-roadmap-4layers.md` format | Pending |

**Input**: Any markdown roadmap with headings + tables
**Output**:
```json
{
  "milestone": "v2.1",
  "epics": [
    {
      "title": "Epic 1: Integration Testing",
      "issues": [
        {
          "title": "Wire watch loop to real repo",
          "type": "feature",
          "subs": [
            "Configure test repo",
            "Run full poll cycle",
            "Verify state persistence"
          ]
        }
      ]
    }
  ]
}
```

---

## Phase 2 — GitHub Hierarchy Creator

**Goal**: Create milestone + epic issues + child issues on GitHub.

| # | Task | Status |
|---|---|---|
| 7 | Create milestone via `gh milestone create` | Pending |
| 8 | Create epic issues with `epic` label (watcher skips these) | Pending |
| 9 | Create child issues per epic with `ready_for_dev` label | Pending |
| 10 | Link children to parent via task list in epic body | Pending |
| 11 | Create sub-issues as checklist items in child issue body | Pending |
| 12 | Add labels: epic, feature, bug, docs based on issue type | Pending |
| 13 | Create labels if they don't exist | Pending |
| 14 | Dry-run mode: show what would be created without creating | Pending |

**Commands used**: `gh milestone create`, `gh issue create`, `gh label create`

---

## Phase 3 — Epic Executor

**Goal**: Plan, cook, test, ship each issue in an epic.

| # | Task | Status |
|---|---|---|
| 15 | Spawn `claude -p "/ck:plan ..."` per issue with proper flags | Pending |
| 16 | Spawn `claude -p "/ck:cook --auto ..."` per issue | Pending |
| 17 | Spawn `claude -p "/test ..."` after cook | Pending |
| 18 | Spawn `claude -p "/ck:git cm ..."` to commit | Pending |
| 19 | Close GitHub issue on success via `gh issue close` | Pending |
| 20 | Update epic body checklist when child closes | Pending |
| 21 | Model routing: opus for plan, sonnet for cook, haiku for report | Pending |
| 22 | Budget control: `--max-budget-usd` per call | Pending |
| 23 | Permission mode: `--permission-mode auto` or `--dangerously-skip-permissions` | Pending |
| 24 | Timeout: kill subprocess after N seconds | Pending |
| 25 | Resume: skip already-closed issues, continue from where left off | Pending |

---

## Phase 4 — Build Status

**Goal**: Show progress across the 4-layer hierarchy.

| # | Task | Status |
|---|---|---|
| 26 | Query milestone progress via `gh milestone view` | Pending |
| 27 | Query epic issues and their children via `gh issue list` | Pending |
| 28 | Show progress bar per epic (closed/total children) | Pending |
| 29 | Show overall milestone progress | Pending |
| 30 | Show cost summary if cost-tracker data available | Pending |

---

## Phase 5 — CLI Wiring

**Goal**: Wire all into `claude-swarm build` subcommand.

| # | Task | Status |
|---|---|---|
| 31 | Add `build` command to CLI entry point (commander.js) | Pending |
| 32 | `build init @roadmap.md` → parse + create hierarchy | Pending |
| 33 | `build plan --epic N` → plan all issues in epic | Pending |
| 34 | `build cook --epic N` → cook all issues in epic | Pending |
| 35 | `build run --epic N --auto` → full cycle (plan→cook→test→ship) | Pending |
| 36 | `build run --all --auto` → all epics sequentially | Pending |
| 37 | `build status` → show hierarchy progress | Pending |
| 38 | `build run --from N --auto` → resume from epic N | Pending |
| 39 | `--dry-run` flag on all subcommands | Pending |
| 40 | `--budget N` flag for max USD per call | Pending |

---

## CLI Reference

```bash
# Parse roadmap and create GitHub hierarchy
claude-swarm build init @docs/roadmap.md
claude-swarm build init @docs/roadmap.md --dry-run

# Plan one epic
claude-swarm build plan --epic 1

# Cook one epic
claude-swarm build cook --epic 1 --auto

# Full cycle: plan → cook → test → ship
claude-swarm build run --epic 1 --auto --budget 20

# All epics
claude-swarm build run --all --auto --budget 20

# Resume from epic 3
claude-swarm build run --from 3 --auto --budget 20

# Check progress
claude-swarm build status
```

---

## Summary

| Phase | What | Files | Tasks |
|---|---|---|---|
| 1 | Roadmap Parser | `roadmap-parser.ts` | 6 |
| 2 | GitHub Hierarchy | `github-hierarchy.ts` | 8 |
| 3 | Epic Executor | `epic-executor.ts` | 11 |
| 4 | Build Status | `build-status.ts` | 5 |
| 5 | CLI Wiring | `build-command.ts` | 10 |
| **Total** | | **5 files** | **40 tasks** |
