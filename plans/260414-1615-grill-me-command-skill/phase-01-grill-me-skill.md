# Phase 01 — grill-me SKILL.md

**Status**: blocked
**Priority**: high

## Context

- Roadmap: `docs/implement-roadmap-grill-me-debrief.md`
- Existing pattern: `.claude/skills/brainstorm/SKILL.md` (for skill format reference)
- Build script phase B1: `build-grill-me-debrief-builder.sh`

## Overview

Create `.claude/skills/grill-me/SKILL.md`. This is a focused spec-interview skill — NOT a brainstorm. It asks sharp questions, forces decisions, and writes a compact `spec.md` artifact into `plans/<plan-dir>/spec.md`.

## Key Design Rules

- Ask 8–15 sharp, targeted questions — no open-ended rambling
- For each major decision, propose 2 branches and ask for explicit agree/disagree
- Resolve critical ambiguities before handing off — do not hand off with unresolved blockers
- Output `plans/<plan-dir>/spec.md` at the end (not just chat text)
- Keep skill file under 150 lines

## spec.md Format (Output Artifact)

```markdown
---
date: <ISO date>
topic: <user topic string>
model: claude-opus-4-6
status: reviewed  # pending | reviewed | approved
reviewed-by-human: false
---

## Summary
One paragraph. What is being built and why.

## Scope (In)
- Bullet list of what IS included

## Non-Goals (Out)
- Bullet list of what is NOT included

## Decision Log
| # | Decision | Options Considered | Chosen | Rationale |
|---|----------|--------------------|--------|-----------|
| 1 | ... | A / B | A | ... |

## Deferred / Open Questions
- Items deferred to later phases without blocking current work

## Risks
- Known risks and unknowns

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## skill.md Content to Write

Create `.claude/skills/grill-me/SKILL.md` with:

```markdown
---
name: grill-me
description: "Spec-interview skill. Asks 8-15 sharp questions, forces decisions, writes plans/<plan-dir>/spec.md. Use before /ck:plan on new medium/large topics."
argument-hint: "[topic or request]"
---

# Grill-Me Skill

You are a specification interviewer. Your job is to surface hidden assumptions, force decisions, and produce a compact, human-readable spec artifact — NOT to brainstorm options endlessly.

## When to Use
- New medium/large feature or architectural change
- Topic where scope is still vague
- Before /ck:plan when no spec trace exists

## When NOT to Use
- Tiny fixes (< 1 day of work)
- Topics where requirements are already fully resolved in a roadmap or existing spec

## Process

### 1. Scout (read-only)
Read `plans/` for active plans. Check `docs/` for relevant existing docs. Understand what already exists so you don't re-ask answered questions.

### 2. Interview (8–15 questions)
Ask sharp, targeted questions. Group by concern:
- **Scope boundary**: What exactly is in? What is explicitly out?
- **Decisions**: For each major design choice, propose 2 concrete options and ask which one.
- **Compatibility**: What existing behavior must not break?
- **Success**: How do we know this is done? What are the acceptance criteria?
- **Risks**: What could go wrong? What's deferred?

Do NOT ask open-ended questions like "What do you want?" or "Any other requirements?".
Ask closed questions with explicit choices: "Should X use approach A or B?"

### 3. Consolidate
After answers, summarize your understanding and ask the user to confirm or correct before writing the artifact.

### 4. Write spec.md
Write the spec artifact to `plans/<plan-dir>/spec.md` using the format below.

**If no active plan dir exists**: create `plans/<date>-<slug>/spec.md` where date = today and slug = kebab-case topic summary (max 5 words).

**Storage rule**: `plans/` is execution truth. Do NOT write to `docs/` or `obsidian-vault/` as the primary spec location.

### 5. Hand off
After writing spec.md, output:

```
Spec written: plans/<plan-dir>/spec.md

Next step: /ck:plan --fast <topic>
  (spec is resolved — use --fast + sonnet to save tokens)
```

Only hand off when critical ambiguities are resolved. If a blocker remains, ask one more targeted question before handing off.

## spec.md Format

```markdown
---
date: <ISO date>
topic: <user topic string>
model: claude-opus-4-6
status: reviewed
reviewed-by-human: false
---

## Summary
## Scope (In)
## Non-Goals (Out)
## Decision Log
## Deferred / Open Questions
## Risks
## Acceptance Criteria
```

## Anti-Patterns to Avoid

| Pattern | Why bad |
|---------|---------|
| "What else do you need?" | Open-ended. Ask specific closed questions. |
| Writing spec before confirmation | Confirm understanding first. |
| Asking >15 questions | Focus. Ruthlessly drop low-priority questions. |
| Writing to docs/ or obsidian-vault/ as primary | plans/ is execution truth. |
| Handing off with unresolved blockers | Resolve or explicitly defer first. |

## Compatibility Rule
Do NOT touch existing generated guides, plan.md files, or in-progress topic docs. Apply grill-me only to new topics going forward.
```

## Implementation Steps

1. `mkdir -p .claude/skills/grill-me`
2. Write `.claude/skills/grill-me/SKILL.md` with the content above
3. Verify line count stays under 150 lines

## Blocker

Write to `.claude/skills/grill-me/SKILL.md` blocked by permissions policy. User must manually create or grant write permission to `.claude/skills/` directory.

## Todo

- [ ] Create `.claude/skills/grill-me/` directory
- [ ] Write `SKILL.md` with spec-interview behavior
- [ ] Verify format matches existing skill patterns (frontmatter, heading structure)
- [ ] Confirm no references to brainstorm or debrief in this skill (keep concerns separate)

## Success Criteria

- `.claude/skills/grill-me/SKILL.md` exists and is loadable
- Skill asks 8–15 focused questions
- Skill writes spec.md to `plans/<plan-dir>/spec.md`
- Skill hands off with `/ck:plan --fast` recommendation
- Existing skills untouched
