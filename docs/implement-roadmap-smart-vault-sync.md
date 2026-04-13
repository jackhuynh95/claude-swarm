# Smart Vault Sync — Implementation Roadmap

**Date**: 2026-04-06
**Goal**: teach the active project to gather and reuse its own lessons every day
**Priority**: Primary first = inside the current target project. Secondary later = optional global/shared second-brain.
**Location**: start inside the project vault first. Only then extend to shared/global sync.

---

## Problem

Dumb copy syncs everything — noise, project-specific fixes, irrelevant notes.
Smart sync uses Claude to classify, filter, and align knowledge before syncing.

This roadmap follows one strict rule:

```text
PRIMARY FIRST
  current target project only
  examples: #medusa, #goldmine

SECONDARY LATER
  optional global/shared second-brain
  only after primary works well
```

```
DUMB (current):  cp *.md → second-brain/     (everything, no filter)
SMART (target):  Claude reads → classifies → promotes only reusable → second-brain/
                 Claude reads second-brain → filters relevant → injects into project
```

---

## Priority Split

```text
Primary = inside the current target project
  purpose:
    teach the project
    gather lessons daily
    reuse them on the next issue / next roadmap task

Secondary = global/shared second-brain
  purpose:
    promote only proven reusable knowledge
    after the inside-project loop is already stable

Rule:
  do not go far into global/shared sync before the inside loop works
```

Build helpers should follow the same split:

```text
build-smart-vault-sync-primary.sh
  runs P1 -> P6 only

build-smart-vault-sync-secondary.sh
  runs S1 -> S4 only

build-smart-vault-sync.sh
  compatibility wrapper only
```

---

## Architecture

```mermaid
graph LR
    subgraph Project["Project Vault"]
        PD["Daily/"]
        PN["Notes/"]
        PDC["Decisions/"]
    end

    CA["Claude Analyzer<br/>(classify + filter)"]

    subgraph Brain["Second Brain"]
        BD["_daily/"]
        BL["_lessons/"]
        BP["_patterns/"]
        BDC["_decisions/"]
    end

    PD -->|"all notes"| CA
    PN -->|"all notes"| CA
    PDC -->|"all notes"| CA

    CA -->|"reusable only"| BL
    CA -->|"patterns only"| BP
    CA -->|"decisions only"| BDC
    CA -->|"skip project-specific"| X["skipped"]

    BL -->|"relevant to task"| CA2["Claude Analyzer<br/>(filter for project)"]
    BP -->|"relevant to task"| CA2
    BDC -->|"relevant to task"| CA2

    CA2 -->|"inject"| PN

    style CA fill:#e94560,stroke:#333,color:#fff
    style CA2 fill:#16213e,stroke:#333,color:#fff
    style X fill:#333,stroke:#333,color:#888
```

---

## Concept Comparison

**Rule**: copy the memory architecture idea, not the Python codebase.

We should reuse the concept from `claude-memory-compiler`:

```text
capture -> compile -> index -> retrieve -> reinject
```

We should NOT port its Python scripts 1:1 into this repo. `claude-swarm` should implement the same loop in Node.js and fit the existing watcher + builder flows.

### Side-by-side

```text
+---------------------------+----------------------------------+-------------------------------------------+
| Area                      | Author already did               | What claude-swarm should do next          |
+---------------------------+----------------------------------+-------------------------------------------+
| Capture                   | SessionEnd / PreCompact hooks    | Add local Node.js hooks                   |
| Raw memory                | transcript -> daily logs         | Save project-inside raw notes / run logs  |
| Curation                  | compile.py builds knowledge      | Build Node.js classifier + compiler       |
| Knowledge structure       | concepts / connections / qa      | lessons / patterns / decisions            |
| Retrieval                 | index-guided retrieval           | Curated index + better ranking            |
| Reinjection               | SessionStart injects context     | Inject inside same project first          |
| Quality control           | lint / stale / contradiction     | Add alignment / lint later                |
| Stack                     | Python                           | Node.js only for implementation           |
+---------------------------+----------------------------------+-------------------------------------------+
```

### Current vs Future

```text
AUTHOR: claude-memory-compiler
--------------------------------------------
Claude session
  -> hooks capture transcript
  -> raw daily logs
  -> compiler reads logs
  -> structured knowledge articles
  -> index.md
  -> session-start injects index
  -> next session uses memory


OURS: claude-swarm today
--------------------------------------------
GitHub issue / roadmap task
  -> watcher flow or builder flow
  -> post-ship journal-writer
  -> Notes/ lessons
  -> vault-context-loader
  -> next /ck:plan gets basic vault context

Gap:
  - no raw session capture pipeline
  - no compiled knowledge index
  - retrieval is still simple keyword scoring
  - roadmap-loader path has no reminder/record step after cook succeeds
  - no strict primary-first separation from global/shared sync


OURS: claude-swarm target
--------------------------------------------
Issue / task / session
  -> local Node.js hooks capture raw notes
  -> Raw/
  -> classifier promotes reusable knowledge
  -> Knowledge/
     -> index.md
     -> Lessons/
     -> Patterns/
     -> Decisions/
  -> retrieval picks relevant notes
  -> /ck:plan and builder get better context inside same project
  -> journal / record / promote loop repeats
```

### Node.js-first implementation rule

```text
COPY THE IDEA
-------------
capture -> compile -> index -> retrieve -> reinject

DO NOT COPY
-----------
python scripts
repo structure 1:1
exact hooks implementation
exact file names
exact article taxonomy
```

---

## Primary Roadmap

Primary means: focus on the inside belonging to the current target project first.

```text
Examples:
  medusa/obsidian-vault/
  goldmine/obsidian-vault/

Primary success means:
  - capture lessons daily
  - reuse them on the next task
  - watcher and roadmap-loader both participate
```

---

## P1 — Project Note Classifier

**Goal**: Claude reads a note and classifies: promote / skip / project-specific.

| # | Task | Status |
|---|---|---|
| 1 | Create `src/commands/sync/note-classifier.ts` | Pending |
| 2 | Spawn Claude (haiku, low effort) to classify each note | Pending |
| 3 | Classification output: `{ action: "promote" \| "skip", reason, category }` | Pending |
| 4 | Categories: lesson, pattern, decision, foundation, project-specific | Pending |
| 5 | Use `--json-schema` for structured classification output | Pending |
| 6 | Batch mode: classify multiple notes in one call (save tokens) | Pending |

**Classification prompt**:
```
Read this note. Classify:
- "promote" if reusable across projects (patterns, standards, conventions, 
  foundation knowledge like framework setup, library configs, code standards)
- "skip" if project-specific (bug fix for one issue, PR-specific context, 
  temporary state)

Output JSON: { action, reason, category }
```

**Model**: haiku (cheap, classification is simple)

---

## P2 — Project Knowledge Capture

**Goal**: capture lessons inside the current project before any global/shared promotion.

| # | Task | Status |
|---|---|---|
| P2.1 | Extend project vault structure for local reusable knowledge: `Knowledge/Lessons`, `Knowledge/Patterns`, `Knowledge/Decisions` | Pending |
| P2.2 | Teach `journal-writer` and `run-recorder` outputs to feed local knowledge capture first | Pending |
| P2.3 | Add roadmap-loader reminder after successful `/ck:cook` so builder tasks also produce lesson candidates | Pending |
| P2.4 | Store provenance in frontmatter: issue/task, project, date, source phase | Pending |

---

## P3 — Project Context Reuse

**Goal**: reuse the same project's proven lessons on the next issue/task.

| # | Task | Status |
|---|---|---|
| P3.1 | Upgrade `vault-context-loader.ts` to read curated `Knowledge/` notes first | Pending |
| P3.2 | Rank local notes by task relevance, recency, and category priority | Pending |
| P3.3 | Inject project-inside context before watcher `/ck:plan` and roadmap-loader `/ck:cook` | Pending |
| P3.4 | Keep retrieval local-first; do not depend on global/shared notes in primary mode | Pending |

---

## S1 — Promote Proven Project Notes To Global Brain

**Goal**: Optional later step. Promote only proven reusable notes out of the project into a shared/global brain.

| # | Task | Status |
|---|---|---|
| 7 | Create `src/commands/sync/smart-pull.ts` | Pending |
| 8 | Read all notes from project vault (Daily/, Notes/, Decisions/) | Pending |
| 9 | Skip notes already in second-brain (by filename) | Pending |
| 10 | Classify new notes via note-classifier | Pending |
| 11 | Copy "promote" notes to correct second-brain folder | Pending |
| 12 | Log skipped notes with reason | Pending |
| 13 | Add frontmatter to promoted notes: `source-project`, `promoted-date` | Pending |
| 14 | Dry-run mode: show what would be promoted without copying | Pending |

**Flow**:
```
smart-pull:
  1. Scan project vault for new .md files
  2. Filter out already-synced (by filename match)
  3. Batch classify remaining via Claude (haiku)
  4. Copy "promote" → second-brain/{category}/
  5. Log "skip" with reason
  6. Add frontmatter: source, date, category
```

---

## S2 — Optional Global Knowledge Push Into Project

**Goal**: Optional later step. Inject only relevant global/shared knowledge back into a project.

| # | Task | Status |
|---|---|---|
| 15 | Create `src/commands/sync/smart-push.ts` | Pending |
| 16 | Accept context: issue title, feature description, or task spec | Pending |
| 17 | Read all second-brain notes (_lessons/, _patterns/, _decisions/) | Pending |
| 18 | Classify relevance to the given context via Claude (sonnet) | Pending |
| 19 | Copy relevant notes to project vault Notes/ | Pending |
| 20 | Skip notes already in project vault | Pending |
| 21 | Add frontmatter: `injected-from: second-brain`, `injected-for: "issue #42"` | Pending |
| 22 | Dry-run mode | Pending |

**Flow**:
```
smart-push --project medusa --context "Add analytics dashboard to Vue admin":
  1. Read all second-brain _lessons/ _patterns/ _decisions/
  2. Claude classifies relevance to "analytics dashboard + Vue admin"
     - chart-js-config-pattern.md → RELEVANT (chart library)
     - vue-3-component-structure.md → RELEVANT (Vue patterns)
     - dotnet-api-conventions.md → RELEVANT (backend standards)
     - medusa-v2-migration.md → NOT RELEVANT
     - ck-ship-fallback.md → NOT RELEVANT
  3. Copy relevant notes to medusa/obsidian-vault/Notes/
  4. vault-context-loader reads these during /ck:plan
```

---

## S3 — Global Alignment Check

**Goal**: Optional later step. Detect conflicts between project vault notes and shared/global notes.

| # | Task | Status |
|---|---|---|
| 23 | Create `src/commands/sync/alignment-checker.ts` | Pending |
| 24 | Compare same-named notes across vaults for drift | Pending |
| 25 | Claude detects: outdated, contradicting, superseded notes | Pending |
| 26 | Report: which notes need updating and which direction | Pending |
| 27 | Auto-update option: newer version wins (with backup) | Pending |

**Example**:
```
alignment-check:
  second-brain/_lessons/chart-js-config-pattern.md  (v2, updated 2026-04-01)
  medusa/obsidian-vault/Notes/chart-js-config-pattern.md  (v1, from 2026-03-15)

  Result: medusa version is OUTDATED. Recommend: sync from second-brain.
```

---

## S4 — Shared Sync CLI

**Goal**: Optional later step. Wire global/shared sync into `claude-swarm sync` subcommand.

| # | Task | Status |
|---|---|---|
| 28 | Add `sync` command to CLI (commander.js) | Pending |
| 29 | `claude-swarm sync pull` → smart-pull from all projects | Pending |
| 30 | `claude-swarm sync pull --project medusa` → one project | Pending |
| 31 | `claude-swarm sync push --project medusa --context "task"` → smart-push | Pending |
| 32 | `claude-swarm sync check` → alignment check all vaults | Pending |
| 33 | `claude-swarm sync check --project medusa` → one project | Pending |
| 34 | `--dry-run` on all subcommands | Pending |
| 35 | `--force` to skip classification (dumb copy, fallback) | Pending |

---

## P4 — Primary Metadata + Safety

**Goal**: Keep project-inside memory safe, track provenance, and prevent bad reprocessing.

| # | Task | Status |
|---|---|---|
| 36 | Add `source-project` frontmatter to promoted notes (smart-pull skips on re-pull) | Pending |
| 37 | Add `injected-from: second-brain` frontmatter to injected notes (smart-pull skips these) | Pending |
| 38 | Enforce one-shot rule: pull and push NEVER chain in same cycle | Pending |
| 39 | Add `synced-at` timestamp to prevent re-processing same note | Pending |

**3 rules that prevent infinite loops**:
```
Rule 1: NEVER chain pull → push in same cycle
  Pull happens AFTER issue completion
  Push happens BEFORE next issue planning
  They never trigger each other

Rule 2: Skip notes with injected-from frontmatter
  Notes pushed FROM second-brain have:
    ---
    injected-from: second-brain
    ---
  Smart-pull sees this → SKIP (don't promote back)

Rule 3: Skip notes with source-project frontmatter
  Notes pulled FROM projects have:
    ---
    source-project: medusa
    promoted-date: 2026-04-06
    ---
  Smart-push sees this → already synced, SKIP
```

---

## P5 — Watcher Integration

**Goal**: Teach the active project through watcher runs. One-shot per cycle.

| # | Task | Status |
|---|---|---|
| 40 | After journal-writer runs → trigger smart-pull ONCE | Pending |
| 41 | Before /ck:plan runs → trigger smart-push ONCE with issue context | Pending |
| 42 | Wire into post-ship-runner.ts (after journal, before next poll) | Pending |
| 43 | Respect loop-prevention rules from Phase 6 | Pending |

**Watcher flow with smart sync**:
```
poll → classify → route → execute → commit
  → GREEN test → RED test → /ck:ship
  → slack-report → journal-writer
  → SMART PULL ONCE (new notes → second-brain)
  → STOP. No more sync this cycle.
  
next poll cycle:
  → SMART PUSH ONCE (relevant notes → project vault)
  → /ck:plan (now has context from second-brain)
  → execute → commit → ...
```

---

## P6 — Builder / Roadmap Loader Integration

**Goal**: Builder gets project-inside memory capture, especially in roadmap-loader execution via `executeFromRoadmap()` in `src/commands/build/epic-executor.ts`.

| # | Task | Status |
|---|---|---|
| 44 | `build generate`: smart-push before brainstorm (inject context) | Pending |
| 45 | `build run --roadmap`: smart-push before each task's /ck:plan | Pending |
| 46 | `build run --roadmap`: smart-pull after each task completes (after /ck:git cm) | Pending |
| 47 | `build run --roadmap`: add lesson capture step after successful `/ck:cook` in `executeFromRoadmap()` | Pending |
| 48 | `build run --roadmap`: write run summary / lesson candidate per task (journal-style artifact) | Pending |
| 49 | Respect same loop-prevention rules from P4 | Pending |

**Builder flow with smart sync (v0.9.5+ pipeline)**:
```
build run --roadmap @docs/implement-roadmap-x.md --phase 1 --auto
  → executeFromRoadmap()
  → for each task:
    → SMART PUSH (inject relevant notes for THIS task)
    → /ck:plan (default) or skip with --fast
    → /ck:cook --auto (implement from plan)
    → lesson capture step (NEW — task 47)
    → /ck:git cm (commit)
    → SMART PULL (promote new lessons)
    → checklist sync (--issue N, optional)
  → /ck:git cp (push at end)

build run --roadmap @plans/*/plan.md --auto
  → same flow, plan.md = 1 phase, each phase-*.md = 1 task
```

**Current roadmap-loader state (v0.9.5)**:

```text
watcher today
  execute
  -> slack-report
  -> journal-writer
  -> run-recorder

roadmap loader today (`executeFromRoadmap()`)
  -> /ck:plan (default, skip with --fast)
  -> /ck:cook --auto
  -> /ck:git cm (commit per task)
  -> checklist sync (optional)
  -> /ck:git cp (push at end)

Still missing (this phase):
  - no smart-push before /ck:plan (inject context)
  - no lesson capture after cook
  - no smart-pull after task completes
  - no journal-style run record for roadmap tasks
```

---

## CLI Reference

```bash
# Smart pull: project vaults → second-brain (classify + promote)
claude-swarm sync pull
claude-swarm sync pull --project medusa
claude-swarm sync pull --dry-run

# Smart push: second-brain → project vault (filter by context)
claude-swarm sync push --project medusa --context "Add analytics dashboard"
claude-swarm sync push --project medusa --context @issue-42.md
claude-swarm sync push --dry-run

# Alignment check: detect drift between vaults
claude-swarm sync check
claude-swarm sync check --project medusa

# Dumb copy fallback (no Claude, just copy)
claude-swarm sync pull --force
claude-swarm sync push --project medusa --force
```

---

## Model Routing

| Step | Model | Effort | Why |
|---|---|---|---|
| Note classification (pull) | haiku | low | Simple classify: promote/skip |
| Relevance filtering (push) | sonnet | medium | Needs context understanding |
| Alignment check | sonnet | low | Compare two versions |

---

## Summary

| Phase | Track | What | Files | Tasks |
|---|---|---|---|---|
| P1 | Primary | Project note classifier | `note-classifier.ts` | 6 |
| P2 | Primary | Project knowledge capture | `journal-writer.ts`, `run-recorder.ts`, builder hook points | 4 |
| P3 | Primary | Project context reuse | `vault-context-loader.ts` | 4 |
| P4 | Primary | Primary metadata + safety | frontmatter rules in pull/push | 4 |
| P5 | Primary | Watcher integration | `post-ship-runner.ts` | 4 |
| P6 | Primary | Builder + roadmap-loader memory capture | `src/commands/build/epic-executor.ts` | 6 |
| S1 | Secondary | Promote proven project notes to global brain | `smart-pull.ts` | 8 |
| S2 | Secondary | Optional global knowledge push into project | `smart-push.ts` | 8 |
| S3 | Secondary | Global alignment check | `alignment-checker.ts` | 5 |
| S4 | Secondary | Shared sync CLI | `sync-command.ts` | 8 |
| **Total** | | **Primary first, Secondary later** | **5 new + 4 upgraded** | **57** |
