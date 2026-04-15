---
name: debrief
description: TTW Debrief (/ttw:debrief) — Spec-vs-Built Review. Compare what was requested, clarified, planned, and actually built. Records what matched, what changed, what was deferred, lessons learned, and follow-up clues. Writes debrief.md to plans/reports/.
---

Run a Spec-vs-Built Review for the completed work.

1. Read the spec artifact if it exists (`plans/<dir>/spec.md`)
2. Read the plan artifact if it exists (`plans/<dir>/plan.md` or matching phase file)
3. Compare against what was actually built (read recent diffs, commits, and changed files)
4. Write `plans/reports/debrief.md` with these sections:

## What matched
What was built exactly as specified or planned.

## What changed
Decisions or scope that shifted during implementation — and why.

## What was deferred
Items explicitly not built, moved out of scope, or left for follow-up.

## Lessons learned
Non-obvious insights from implementation: gotchas, unexpected constraints, better approaches discovered.

## Follow-up tasks / clues
Concrete next steps, open questions, or clues for the next person picking this up.

Be specific and factual. Do not summarize what the code does — compare spec intent vs built result.
