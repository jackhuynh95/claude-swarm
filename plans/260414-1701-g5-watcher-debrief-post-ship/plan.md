---
title: "G5 — Wire Watcher Debrief into post-ship-runner.ts"
date: 2026-04-14
status: pending
priority: high
blockedBy: [260414-1638-g4-g5-debrief-skill-executor-wiring]
blocks: []
---

# Plan: G5 — Wire Watcher Debrief into post-ship-runner.ts

**Goal**: Insert a debrief phase inside `executePostShip()` between the Slack report (step 8) and journal (step 9) so downstream traces (journal, run-recorder, knowledge extraction) can consume the debrief output.

**Blocked by**: G4+G5 plan (`260414-1638-g4-g5-debrief-skill-executor-wiring`) — debrief skill must exist before this wires it.

**Do NOT**: migrate watcher clarify into grill-me (deferred).

## Phases

| Phase | File | Status |
|-------|------|--------|
| 01 | [phase-01-post-ship-debrief-wiring.md](phase-01-post-ship-debrief-wiring.md) | pending |

## Key Files

| Action | File |
|--------|------|
| Modify | `src/commands/watch/phases/post-ship-runner.ts` |

## Scope

- **In**: debrief prompt builder, debrief invoke (step 8.5) between slack and journal, debrief result passed as context to journal + run-recorder, debrief artifact path logged
- **Out**: grill-me/clarify migration, vault mirroring, debrief CLI command, G6/G7 policy, any change outside post-ship-runner.ts

## Post-ship Step Order (After)

```
1.  test-flow (green gate)
2.  security-flow (red, advisory)
3.  scout
4.  predict (hardMode only)
5.  ship (/ck:ship)
6.  fallback (createPullRequest)
7.  design-review
8.  slack
8.5 debrief  ← NEW (before journal so journal can reference it)
9.  journal
10. llms
11. run-recorder
12. knowledge extraction
```
