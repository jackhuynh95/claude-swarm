# Claude-Swarm Implementation Roadmap

**Date**: 2026-04-01
**Source**: CK watch analysis + CK v2.14.0 spec + auto-claude pipeline + GPT-5.4 research + team workflow insights
**Repo**: `claude-swarm` (fork of `mrgoonie/claudekit-cli`)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      claude-swarm v2.0                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  OBSIDIAN VAULT (Human Knowledge Layer)                   │  │
│  │                                                           │  │
│  │  Daily/       ← auto-journal after each run               │  │
│  │  Notes/       ← lessons, patterns, decisions              │  │
│  │  Review/Runs/ ← test results, run summaries               │  │
│  │  Decisions/   ← architecture decision records             │  │
│  │                                                           │  │
│  │  Rule: if humans must read it → obsidian-vault/           │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │ read/write                       │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │  CLAUDE NATIVE MEMORY (Runtime Continuity)                │  │
│  │                                                           │  │
│  │  .claude/memory/  ← session carry-over                    │  │
│  │  CLAUDE.md        ← project conventions                   │  │
│  │  /dream           ← Claude-native consolidation           │  │
│  │                                                           │  │
│  │  Rule: if Claude needs continuity → let dream handle it   │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │  CK WATCH DAEMON (Orchestration — kept from fork)         │  │
│  │                                                           │  │
│  │  watch-command.ts  ← daemon loop, poll config             │  │
│  │  state-manager.ts  ← .ck.json persistence, crash recovery│  │
│  │  issue-poller.ts   ← gh issue list polling                │  │
│  │  approval-checker  ← owner "approve" gate                 │  │
│  │  worktree-manager  ← git worktree isolation               │  │
│  │  process lock      ← .ck.lock no duplicate daemons        │  │
│  │  rate limiting     ← processedThisHour / maxPerHour       │  │
│  │  timeout           ← SIGTERM → 5s → SIGKILL               │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │  ISSUE ROUTER (Replaced — auto-claude brain)              │  │
│  │                                                           │  │
│  │  issue-router.ts   ← label + type detection               │  │
│  │  model-router.ts   ← opus/sonnet/haiku per phase          │  │
│  │                                                           │  │
│  │  [BUG]           → debug-flow                             │  │
│  │  [FEATURE]       → ship-flow                              │  │
│  │  [DOCS/CHORE]    → ship-flow (--no-test)                  │  │
│  │  "hard" label    → debug-flow (opus)                      │  │
│  │  "frontend" label→ + design-reviewer                      │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────┐                │
│         ▼                    ▼                ▼                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Debug Flow  │  │ Ship Flow    │  │ Verify Flow  │          │
│  │             │  │              │  │              │          │
│  │ /debug      │  │ /plan:fast   │  │ /test:e2e    │          │
│  │ /fix        │  │ /ck:cook --auto│  │ agent-browser│          │
│  │ /test       │  │  or          │  │              │          │
│  │ retry loop  │  │ /ck:cook --no-test│  │              │          │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘          │
│         └────────────────┼─────────────────┘                   │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  POST-SHIP PHASES (Auto-Claude Exclusives)                │  │
│  │                                                           │  │
│  │  verifier.ts       ← independent verify agent (PASS/FAIL)│  │
│  │  e2e-runner.ts     ← agent-browser verification           │  │
│  │  slack-reporter.ts ← /slack-report to team                │  │
│  │  design-reviewer.ts← frontend-design review               │  │
│  │  journal-writer.ts ← obsidian-vault daily + notes         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STANDALONE CLI TOOLS (No watcher needed)                 │  │
│  │                                                           │  │
│  │  slack-reader.ts   ← /slack-read task extraction          │  │
│  │  brainstormer.ts   ← /brainstorm → /issue pipeline        │  │
│  │  slack-reporter.ts ← /slack-report standalone             │  │
│  │  e2e-runner.ts     ← /test:e2e standalone                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  State lifecycle (14 states):                                   │
│  new → brainstorming → clarifying → planning → plan_posted      │
│    → awaiting_approval → implementing → testing                  │
│    → verifying → e2e_testing → reporting → journaling            │
│    → completed                                                   │
│    → error / timeout / needs_refix                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0 — CK v2.14.0 Command Migration & New Skills

**Goal**: Align with ClaudeKit v2.14.0 breaking changes and adopt new capabilities.

### Breaking Changes: Command Migration

| Legacy Command | New Command (v2.14.0) | Used In |
|---|---|---|
| `/code @plan.md` | `/ck:cook @plan.md` | ship-flow.ts |
| `/code:no-test` | `/ck:cook <task> --no-test` | ship-flow.ts (DOCS/CHORE) |
| `/code:parallel` | `/ck:cook <task> --parallel` | parallel execution |
| `/code:auto` | `/ck:cook <task> --auto` | ship-flow.ts (unattended) |

All `/ck:` prefix is **mandatory** in v2.14.0+ to avoid Claude Code built-in collisions.

### New CK v2.14.0 Skills to Integrate

| # | Task | Status |
|---|---|---|
| 0a | Migrate all `/code:*` refs → `/ck:cook` in execution flows | Pending |
| 0b | Integrate `/ck:team` — spawn parallel agents (research, implement, review, debug) | Pending |
| 0c | Integrate `/ck:team` red-team protocol into verifier.ts (adversarial review) | Pending |
| 0d | Integrate `/ck:ship` — automated feature branch lifecycle (test → review → PR) | Pending |
| 0e | Integrate `/ck:ship --official` vs `--beta` branch targeting | Pending |
| 0f | Integrate `/ck:security-scan` into post-ship safety phase | Pending |
| 0g | Integrate `/ck:llms` — generate llms.txt for AI-native codebase comprehension | Pending |
| 0h | Integrate `/ck:problem-solving` techniques into debug-flow.ts | Pending |

### Updated Skill Mapping (v2.14.0)

```
Phase: Brainstorm   → /ck:brainstorm (unchanged)
Phase: Plan         → /ck:plan --fast (unchanged)
Phase: Plan review  → /ck:plan red-team [NEW — adversarial review]
Phase: Implement    → /ck:cook --auto @plan.md [RENAMED from /code:auto]
Phase: Ship         → /ck:ship --official [NEW — full branch lifecycle]
Phase: Security     → /ck:security-scan --full [NEW — OWASP audit]
Phase: Debug        → /ck:problem-solving when-stuck [NEW — 6 sub-techniques]
Phase: Team spawn   → /ck:team implement --devs 2 --reviewers 1 [NEW]
Phase: Docs         → /ck:llms [NEW — llms.txt generation]
```

### Impact on Execution Flows

**debug-flow.ts** (enhanced):
```
/debug → /ck:problem-solving when-stuck (if stuck after retry)
       → /ck:cook --auto (fix, renamed from /code:auto)
       → /test
       → /ck:security-scan (if security label)
```

**ship-flow.ts** (enhanced):
```
/ck:plan --fast → /ck:plan red-team (adversarial review)
               → /ck:cook --auto @plan.md (renamed from /code:auto)
               → /ck:ship --official (replaces manual git push + gh pr create)
```

**verifier.ts** (enhanced):
```
/ck:team review --reviewers 2 (spawn adversarial reviewers)
  → Pass 1: standard quality
  → Pass 2: red-team protocol (think like attackers)
  → PASS / FAIL / PARTIAL verdict
```

**Milestone**: All commands use `/ck:` prefix. New v2.14.0 skills wired into flows.

---

## Phase 1 — Foundation (Fork + Skeleton)

**Goal**: Fork CK watch, set up project structure, keep CK core running.

| # | Task | Status |
|---|---|---|
| 1 | Fork `mrgoonie/claudekit-cli` → `claude-swarm` | Done |
| 2 | Set up project structure (docs/, obsidian-vault/, .claude/) | Done |
| 3 | Verify CK watch daemon runs as-is from fork | Done |
| 4 | Create `obsidian-vault/` skeleton (Daily/, Notes/, Review/, Decisions/) | Done |
| 5 | Create CLAUDE.md with project conventions | Done |
| 6 | Set up GitHub labels (ready_for_dev, shipped, verified, etc.) | Done |
| 7 | Port `setup-labels.sh` logic or create TS equivalent | Done |

**Milestone**: CK watch daemon runs against a test repo from the fork.

---

## Phase 2 — Issue Router (Replace CK Brain)

**Goal**: Replace CK's single-track `/ck:cook` with multi-track routing.

| # | Task | Status |
|---|---|---|
| 8 | Create `issue-router.ts` — label + type detection | Done |
| 9 | Create `model-router.ts` — opus/sonnet/haiku per phase | Done |
| 10 | Wire router into CK's poll cycle (replace single-track dispatch) | Done |
| 11 | Add issue type detection: [BUG] → debug-flow, [FEATURE] → ship-flow | Done |
| 12 | Add smart label injection: "hard" → opus, "frontend" → design-review | Done |
| 13 | Add [DOCS/CHORE] → ship-flow with --no-test | Done |

**Milestone**: Watcher routes different issue types to different flows.

---

## Phase 3 — Execution Flows (Port Auto-Claude Logic)

**Goal**: Port fix-issue.sh and ship-issue.sh logic into TypeScript phases.

| # | Task | Status |
|---|---|---|
| 14 | Create `debug-flow.ts` — /debug → /fix → /test retry loop | Pending |
| 15 | Create `ship-flow.ts` — /plan:fast → /ck:cook --auto → PR | Pending |
| 16 | Port Claude CLI subprocess spawning with timeout (SIGTERM → 5s → SIGKILL) | Pending |
| 17 | Port branch setup + commit + PR creation logic | Pending |
| 18 | Port label transition logic (ready_for_dev → shipped → verified) | Pending |
| 19 | Add clarifying phase — Claude asks spec questions, waits for reply | Pending |

**Milestone**: Debug-flow and ship-flow execute issues end-to-end.

---

## Phase 4 — Post-Ship Phases (Auto-Claude Exclusives)

**Goal**: Add capabilities CK doesn't have — our moat.

| # | Task | Status |
|---|---|---|
| 20 | Create `verifier.ts` — independent verify agent (PASS/FAIL/PARTIAL) | Pending |
| 21 | Create `e2e-runner.ts` — agent-browser E2E testing | Pending |
| 22 | Create `slack-reporter.ts` — /slack-report to team channel | Pending |
| 23 | Create `design-reviewer.ts` — frontend-design review (manual trigger only) | Pending |
| 24 | Create `journal-writer.ts` — obsidian-vault Daily + Notes extraction | Pending |
| 25 | Wire all post-ship phases into watcher lifecycle | Pending |

**Milestone**: After implementation, watcher auto-verifies, E2E tests, reports to Slack, journals to Obsidian.

---

## Phase 5 — Standalone CLI Tools

**Goal**: Port standalone tools that work without the watcher.

| # | Task | Status |
|---|---|---|
| 26 | Create `slack-reader.ts` — /slack-read task extraction | Pending |
| 27 | Create `brainstormer.ts` — /brainstorm → /issue pipeline | Pending |
| 28 | CLI entry points: `claude-swarm read`, `claude-swarm brainstorm`, etc. | Pending |
| 29 | Port report-issue standalone mode | Pending |

**Milestone**: Standalone CLI tools work independently of the watcher daemon.

---

## Phase 6 — Safety & Reliability (GPT-5.4 Recommendations)

**Goal**: Production-grade safety for overnight unattended runs.

| # | Task | Status |
|---|---|---|
| 30 | Add sensitive data filter — strip secrets before posting to GitHub | Pending |
| 31 | Add response truncation — respect GitHub API limits | Pending |
| 32 | Add AI disclaimer to bot comments | Pending |
| 33 | Add comment loop prevention — detect own bot comments, skip | Pending |
| 34 | Add maintainer-last detection — don't spam after discussion closes | Pending |
| 35 | Add budget guards — per-worker token caps, continuation limits | Pending |
| 36 | Add nightly cost summary | Pending |
| 37 | Add conversation history tracking across phases per issue | Pending |

**Milestone**: Safe for overnight unattended runs with budget controls.

---

## Phase 7 — Obsidian Vault Integration

**Goal**: Hybrid memory — Obsidian for humans, /dream for Claude.

| # | Task | Status |
|---|---|---|
| 38 | Create `/obsidian-journal` skill — daily journal + lesson extraction | Done (from CK fork: .claude/rules/obsidian-integration.md + 7 commands) |
| 39 | Wire journal-writer as post-ship phase in watcher | Pending |
| 40 | Context loading — read obsidian-vault/Notes before planning | Pending |
| 41 | Daily journal format: issues completed, decisions, lessons, unresolved | Done (covered by /obsidian-journal, /obsidian-lesson, /obsidian-decide) |
| 42 | Notes extraction: detect patterns, create [[wikilinked]] notes | Done (covered by /obsidian-pattern, /obsidian-link) |
| 43 | Review/Runs: store test results and run summaries | Pending |

**Milestone**: Watcher reads vault before planning, writes journal after completing.

---

## Phase 8 — Operator UX & Observability

**Goal**: Answer "what's running, what failed, what did it cost?"

| # | Task | Status |
|---|---|---|
| 44 | Create `claude-swarm status` command — show active tasks, queue, results | Pending |
| 45 | Create run history / resume index | Pending |
| 46 | Task metadata layer: id, role, start/end, status, exit reason, artifacts | Pending |
| 47 | Create capability matrix (implemented / partial / planned / rejected) | Pending |
| 48 | Searchable plan/run/review index | Pending |

**Milestone**: Operator can inspect, resume, and audit all swarm activity.

---

## Capability Matrix

| Capability | CK Fork (Kept) | Auto-Claude (Ported) | New | Phase |
|---|---|---|---|---|
| `/ck:cook` migration (from /code:*) | | | Yes | 0 |
| `/ck:team` parallel agents + red-team | | | Yes | 0 |
| `/ck:ship` branch lifecycle automation | | | Yes | 0 |
| `/ck:security-scan` OWASP audit | | | Yes | 0 |
| `/ck:llms` AI-native docs generation | | | Yes | 0 |
| `/ck:problem-solving` 6 sub-techniques | | | Yes | 0 |
| Daemon loop + poll | Yes | | | 1 |
| State persistence (.ck.json) | Yes | | | 1 |
| Process lock | Yes | | | 1 |
| Rate limiting | Yes | | | 1 |
| Timeout (SIGTERM→SIGKILL) | Yes | | | 1 |
| Approval gate | Yes | | | 1 |
| Worktree isolation | Yes | | | 1 |
| Issue type routing | | Yes (looper.sh) | | 2 |
| Model routing per phase | | Yes (ship/fix scripts) | | 2 |
| Label-based smart flags | | Yes (looper.sh) | | 2 |
| Debug → fix → test loop | | Yes (fix-issue.sh) | | 3 |
| Ship flow (plan → code → PR) | | Yes (ship-issue.sh) | | 3 |
| Label transitions | | Yes (ship/fix scripts) | | 3 |
| Clarifying phase | | | Yes | 3 |
| Verifier agent (PASS/FAIL) | | | Yes | 4 |
| E2E browser testing | | Yes (verify-issue.sh) | | 4 |
| Slack reporting | | Yes (report-issue.sh) | | 4 |
| Design review | | Yes (--frontend-design) | | 4 |
| Obsidian journal | | | Yes | 4 |
| Slack reader (standalone) | | Yes (read-issue.sh) | | 5 |
| Brainstormer (standalone) | | Yes (brainstorm-issue.sh) | | 5 |
| Sensitive data filter | | | Yes | 6 |
| Budget guards | | | Yes | 6 |
| AI disclaimer | | | Yes | 6 |
| Comment loop prevention | | | Yes | 6 |
| Obsidian vault integration | | | Yes | 7 |
| Operator status command | | | Yes | 8 |
| Run history + resume | | | Yes | 8 |
| Capability matrix tracking | | | Yes | 8 |

---

## Project Structure

```
claude-swarm/
├── .claude/
│   ├── skills/
│   │   ├── obsidian-journal/
│   │   └── ...
│   ├── commands/
│   └── memory/
├── docs/
│   ├── implement-roadmap.md          ← this file
│   ├── architecture.md
│   ├── capability-matrix.md
│   └── code-standards.md
├── obsidian-vault/
│   ├── .obsidian/
│   ├── Daily/
│   ├── Notes/
│   ├── Review/Runs/
│   └── Decisions/
├── src/
│   ├── commands/
│   │   └── watch/
│   │       ├── watch-command.ts      ← CK kept
│   │       ├── types.ts              ← CK kept (expanded)
│   │       └── phases/
│   │           ├── issue-poller.ts   ← CK kept
│   │           ├── state-manager.ts  ← CK kept
│   │           ├── approval-checker.ts← CK kept
│   │           ├── worktree-manager.ts← CK kept
│   │           ├── claude-invoker.ts ← CK kept (modified)
│   │           ├── implementation-runner.ts ← CK kept (modified)
│   │           ├── issue-router.ts   ← NEW (auto-claude brain)
│   │           ├── model-router.ts   ← NEW
│   │           ├── debug-flow.ts     ← NEW (fix-issue.sh)
│   │           ├── ship-flow.ts      ← NEW (ship-issue.sh)
│   │           ├── clarifier.ts      ← NEW
│   │           ├── verifier.ts       ← NEW
│   │           ├── e2e-runner.ts     ← NEW (verify-issue.sh)
│   │           ├── slack-reporter.ts ← NEW (report-issue.sh)
│   │           ├── design-reviewer.ts← NEW
│   │           ├── journal-writer.ts ← NEW
│   │           ├── safety-filter.ts  ← NEW
│   │           └── budget-guard.ts   ← NEW
│   └── cli/
│       ├── slack-reader.ts           ← standalone
│       ├── brainstormer.ts           ← standalone
│       └── status.ts                 ← standalone
├── plans/
├── tests/
├── package.json
└── README.md
```

---

## Key Design Principles

1. **Hybrid memory**: Obsidian for humans, /dream for Claude — not replacement, complement
2. **Wrap Claude Code, don't replace it**: Use CLI skills (/debug, /fix, /plan:fast, /ck:cook --auto) — don't rebuild Claude
3. **Files as protocol**: Plans, reports, journals in real files — debuggable, git-versioned
4. **Verification before reporting**: Verifier blocks optimistic success claims
5. **Local-first**: No dependency on remote services beyond GitHub and Slack
6. **Keep CK core stable**: Modify routing, add phases — don't rewrite the daemon
7. **Budget awareness**: Per-worker caps, continuation limits, nightly summaries

---

## Research Sources

| Source | Location | Key Insight |
|---|---|---|
| CK v2.14.0 spec | `auto-claude/ClaudeKit_Engineer_v2_14_0_AI_Agent_Instruction_Specification.md` | Breaking: /code→/ck:cook, new: /ck:team, /ck:ship, /ck:security-scan, /ck:llms, /ck:problem-solving |
| CK watch analysis | `auto-claude/issues/research-claudekit-watch/` | 17-capability comparison, CK covers ship flow |
| CK watch source code | `auto-claude/plans/reports/researcher-260330-1701-*` | Full source extraction, 15 modules, 9-state lifecycle |
| CK watch gap analysis | `auto-claude/plans/reports/researcher-260330-1736-*` | 13 gaps (clarifying, safety filter, rate limiting) |
| GPT-5.4 Obsidian research | `auto-claude/issues/research-ck-v2-obsidian-vault-by-gpt-5.4/` | Hybrid model: vault + dream |
| GPT-5.4 CLI learnings | `auto-claude/issues/research-ck-v2-obsidian-vault-by-gpt-5.4-free-code/` | Wrap CLI better, verification, budget, parity matrix |
| Team workflow insights | Internal discussion 2026-03-31 | 2 days specifying, Obsidian as memory, /obsidian-journal |
| Auto-claude existing scripts | `auto-claude/*.sh` | fix, ship, verify, report, read, brainstorm, looper |
