# Execution Playbook

How to implement the roadmap phase by phase using Claude Code + CK v2.14.0 skills.

---

## Quick Reference

```
Per phase:     /ck:plan → /ck:cook → /test → /ck:ship
Per hard phase:/ck:plan → /ck:plan red-team → /ck:cook → /test → /ck:team review → /ck:ship
Per parallel:  /ck:team implement --devs 2 → /test → /ck:ship
```

---

## Pre-Flight

```bash
cd ~/Documents/GitHub/claude-swarm
claude
```

Verify CK version:
```bash
ck --version  # must be >= 2.14.0
```

---

## Phase 0 + 1 — Foundation (Start Here)

These phases are combined because Phase 0 (migration) and Phase 1 (skeleton) are tightly coupled.

```bash
# 1. Plan (opus, high effort — architectural decisions)
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 0 (CK v2.14.0 command migration) and Phase 1 (Foundation).
  Tasks: migrate /code:* to /ck:cook, set up project structure,
  verify CK watch daemon runs, create obsidian-vault/ skeleton,
  create CLAUDE.md, set up GitHub labels." \
  --model opus --effort high --max-turns 8

# 2. Execute (sonnet — code execution)
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 10

# 3. Test
claude -p "/test" --model sonnet --effort low --max-turns 3

# 4. Ship to beta
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: CK watch daemon runs from fork, all commands use `/ck:` prefix, project structure exists.

---

## Phase 2 — Issue Router

```bash
# 1. Plan (opus — routing logic is a design decision)
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 2 (Issue Router).
  Tasks: create issue-router.ts, model-router.ts,
  wire into poll cycle, add type detection (BUG/FEATURE/DOCS),
  add smart label injection (hard/frontend)." \
  --model opus --effort high --max-turns 8

# 2. Execute
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 10

# 3. Test + ship
claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: Watcher routes [BUG] → debug-flow, [FEATURE] → ship-flow, [DOCS] → ship-flow --no-test.

---

## Phase 3 — Execution Flows (Hard Phase)

This is the hardest phase — port fix-issue.sh and ship-issue.sh logic to TypeScript.

```bash
# 1. Plan (opus, full plan — this is complex)
claude -p "/ck:plan @docs/implement-roadmap.md
  Implement Phase 3 (Execution Flows).
  Tasks: create debug-flow.ts (/debug → /fix → /test retry loop),
  create ship-flow.ts (/ck:plan --fast → /ck:cook --auto → PR),
  port subprocess spawning with timeout,
  port branch setup + commit + PR creation,
  port label transitions, add clarifying phase." \
  --model opus --effort max --max-turns 10

# 2. Adversarial review of plan (red-team)
claude -p "/ck:plan red-team @plans/latest/plan.md" \
  --model opus --effort high --max-turns 5

# 3. Execute (after reviewing red-team feedback)
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 10

# 4. Full review
claude -p "/ck:team review 'Phase 3 execution flows' --reviewers 2" \
  --model sonnet --max-turns 5

# 5. Test + ship
claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: Debug-flow and ship-flow execute issues end-to-end with retry loops.

---

## Phase 4 — Post-Ship Phases (Parallel Safe)

Independent modules — can be built in parallel.

```bash
# Option A: Sequential (safer)
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 4 (Post-Ship Phases).
  Tasks: e2e-runner.ts, slack-reporter.ts,
  design-reviewer.ts, journal-writer.ts, security-flow.ts,
  wire all into watcher lifecycle via post-ship-runner.ts." \
  --model opus --effort high --max-turns 8

claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 10

# Option B: Parallel (faster, if no file conflicts)
claude -p "/ck:team implement 'Phase 4: build e2e-runner, slack-reporter, design-reviewer, journal-writer, security-flow as independent modules' --devs 2 --reviewers 1" \
  --model sonnet --max-turns 10

# Test + ship
claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: Watcher orchestrates post-ship: security-scan → e2e → scout → predict (hard only) → /ck:ship (or fallback) → design-review → slack-report → journal.

---

## Phase 5 — Standalone CLI Tools

```bash
# Plan + execute (straightforward)
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 5 (Standalone CLI Tools).
  Tasks: slack-reader.ts, brainstormer.ts,
  CLI entry points, report-issue standalone." \
  --model opus --effort medium --max-turns 5

claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 8

claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: `claude-swarm read`, `claude-swarm brainstorm` work standalone.

---

## Phase 6 — Safety & Reliability

```bash
# Plan with security focus
claude -p "/ck:plan @docs/implement-roadmap.md
  Implement Phase 6 (Safety & Reliability).
  Tasks: sensitive data filter, response truncation,
  AI disclaimer, comment loop prevention,
  maintainer-last detection, budget guards,
  nightly cost summary, conversation history tracking." \
  --model opus --effort high --max-turns 8

# Execute
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 10

# Security scan (new CK v2.14.0 capability)
claude -p "/ck:security-scan --full" \
  --model sonnet --effort medium --max-turns 3

# Test + ship
claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --beta" --model sonnet --max-turns 5
```

**Done when**: Safe for overnight unattended runs with budget controls.

---

## Phase 7 — Obsidian Vault Integration

```bash
# Plan
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 7 (Obsidian Vault Integration).
  Tasks: /2nd-brain:obsidian-journal skill, wire journal-writer as post-ship phase,
  context loading from vault before planning,
  daily journal format via skill, notes extraction with [[wikilinks]],
  flat vault folders: Daily/, Notes/, Review/, Runs/, Knowledge/." \
  --model opus --effort high --max-turns 8

# Execute
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 8

# Test + ship
claude -p "/test" --model sonnet --effort low --max-turns 3
claude -p "/ck:ship --official" --model sonnet --max-turns 5
```

**Done when**: Watcher and builder both write vault traces (Daily/, Runs/, Review/, Knowledge/, Notes/) after completing; journal uses `/2nd-brain:obsidian-journal` skill.

---

## Phase 8 — Operator UX & Observability

```bash
# Plan
claude -p "/ck:plan --fast @docs/implement-roadmap.md
  Implement Phase 8 (Operator UX & Observability).
  Tasks: claude-swarm status command, run history/resume index,
  task metadata layer, capability matrix, searchable index." \
  --model opus --effort medium --max-turns 5

# Execute
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-turns 8

# Final review (full red-team)
claude -p "/ck:team review 'Full claude-swarm v2.0' --reviewers 2" \
  --model sonnet --max-turns 5

# Ship to main
claude -p "/ck:ship --official" --model sonnet --max-turns 5
```

**Done when**: Operator can inspect, resume, and audit all swarm activity.

---

## After Each Phase Checklist

```
[ ] Tests pass
[ ] No secrets committed
[ ] Code review (or /ck:team review)
[ ] Ship to beta (or official for final phases)
[ ] Update implement-roadmap.md task statuses
[ ] Journal to Obsidian (once Phase 7 is live)
```

---

## Overnight Execution (After All Phases Built)

```bash
# Jack's overnight scenario
cd ~/Documents/GitHub/target-project

# Start watcher
claude-swarm watch --auto-approve --interval 2h

# Or via Claude Code /loop
/loop 2h claude-swarm watch --cycle
```

Morning check:
```bash
claude-swarm status
# Shows: issues processed, PRs created, E2E results, cost summary
```

---

## Token Budget Per Phase (Estimated)

| Phase | Plan | Execute | Test | Review | Total |
|---|---|---|---|---|---|
| 0+1 Foundation | ~40K | ~40K | ~15K | — | ~95K |
| 2 Router | ~30K | ~30K | ~15K | — | ~75K |
| 3 Flows (hard) | ~50K | ~50K | ~15K | ~20K | ~135K |
| 4 Post-Ship | ~30K | ~40K | ~15K | — | ~85K |
| 5 CLI Tools | ~20K | ~30K | ~15K | — | ~65K |
| 6 Safety | ~30K | ~40K | ~15K | ~20K | ~105K |
| 7 Obsidian | ~30K | ~30K | ~15K | — | ~75K |
| 8 Operator UX | ~20K | ~30K | ~15K | ~20K | ~85K |
| **Total** | | | | | **~720K** |

Estimated cost: ~$20-25 total across all phases (at current API pricing).
