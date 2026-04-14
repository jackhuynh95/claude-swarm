---
phase: 01
title: "Debrief Skill (SKILL.md)"
status: pending
priority: high
---

# Phase 01 — Debrief Skill

**Goal**: Create `.claude/skills/debrief/SKILL.md` — a structured post-build comparison skill that compares what was built vs spec/plan artifacts and produces a concise human-readable debrief.

## Context Links

- Roadmap: `plans/` (this plan)
- Spec artifact format: `plans/<plan-dir>/spec.md` (from G2 plan: `260414-1630-spec-artifact-writer`)
- Plan artifact format: `plans/<plan-dir>/plan.md` (standard plan.md format)
- Epic executor wiring: Phase 02 of this plan

## Overview

The debrief skill is NOT a journal summary. It is a structured comparison tool that:
1. Reads spec.md + plan.md from the task's plan dir (if available)
2. Compares against what was actually built (cook output summary, git diff, file changes)
3. Records matches, gaps, deferrals, surprises
4. Produces a concise debrief artifact that a human can read in 2-3 minutes

## Behavior Spec

- **Input context**: task title, roadmap path, phase, cook output summary, spec.md path (optional), plan.md path (optional)
- **Output**: debrief artifact written to `plans/reports/debrief-{date}-{slug}.md`
- **Questions covered**:
  1. Did we build what we said we would build?
  2. Which decisions changed during implementation?
  3. Which edge cases appeared only during coding/testing?
  4. What was intentionally deferred?
  5. What should become the next task or issue?

## Artifact Format

```markdown
---
date: YYYY-MM-DD
task: <task title>
roadmap: <roadmap path>
spec: <spec.md path or "not found">
plan: <plan.md path or "not found">
model: <model used>
status: complete
---

# Debrief: <task title>

## Summary
<1-3 sentences: what was built>

## Matched Scope
<list: what matched the spec/plan>

## Changes During Implementation
<list: decisions that changed vs spec/plan>

## Deferred
<list: what was explicitly not built>

## Surprises / Edge Cases
<list: unexpected findings>

## Follow-up Tasks
<numbered list: concrete next tasks>

## Trace
- spec.md: <present/absent>
- plan.md: <present/absent>
- cook output: <first 200 chars of cook stdout or "unavailable">
```

## Files to Create

- `.claude/skills/debrief/SKILL.md`

## Implementation Steps

1. Create `.claude/skills/debrief/` directory
2. Write `SKILL.md` with:
   - Trigger: `/debrief` or invoked by executor
   - Input parsing: reads `ARGUMENTS` for task title, roadmap, spec path, plan path, cook summary
   - Behavior: compare inputs, fill artifact template, write to `plans/reports/debrief-{date}-{slug}.md`
   - KISS: skill is a prompt template, not a script — Claude fills the sections from provided context
   - Stop condition: artifact written → print artifact path

## Todo

- [ ] Create `.claude/skills/debrief/SKILL.md`
- [ ] Verify skill triggers correctly when invoked with `/debrief`

## Success Criteria

- `.claude/skills/debrief/SKILL.md` exists and is under 120 lines
- Skill produces a debrief artifact at `plans/reports/debrief-{date}-{slug}.md`
- Artifact has all required sections: summary, matched, changes, deferred, surprises, follow-ups, trace
- Works with missing spec.md or plan.md (best-effort: marks "not found")
