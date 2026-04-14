---
date: 2026-04-14
topic: "Add public command claude-swarm grill-me <topic> backed by repo-local grill-me skill"
model: claude-sonnet-4-6
status: reviewed
reviewed-by-human: false
source: "docs/implement-roadmap-grill-me-debrief.md (Phase G1 + G6)"
---

## Summary

Add `claude-swarm grill-me <topic>` as a public CLI command backed by a repo-local `grill-me` skill at `.claude/skills/grill-me/SKILL.md`. The skill runs a focused spec-interview (8–15 sharp questions), forces explicit decisions on major choices, writes a compact `plans/<plan-dir>/spec.md` artifact, and hands off to `/ck:plan --fast`. Existing guides and in-progress topics are not touched.

## Scope (In)

- `.claude/skills/grill-me/SKILL.md` — new spec-interview skill
- `src/cli/grill-me.ts` — new CLI command module (follows brainstormer.ts pattern)
- `src/index.ts` — add `grillMeCommand` import + `program.addCommand()` call
- `plans/<plan-dir>/spec.md` — output artifact written by the skill at runtime

## Non-Goals (Out)

- Debrief skill (Phase G4 — separate plan)
- Builder integration (`roadmap-generator.ts`, `generate-doc.ts`, `from-scratch-pipeline.ts`) — Phase G3
- Watcher integration — deferred (poll-safe marker not ready)
- Modifying existing `brainstorm` skill or CLI command
- Writing to `docs/` or `obsidian-vault/` as primary spec location
- GitHub issue creation from grill-me output (brainstorm handles that)

## Decision Log

| # | Decision | Options Considered | Chosen | Rationale |
|---|----------|--------------------|--------|-----------|
| 1 | Default model for grill-me | sonnet / opus | opus (`claude-opus-4-6`) | Advisor stage — stronger model for challenging assumptions |
| 2 | Invocation mechanism | New invoker / `invokeClaudePhase()` | Reuse `invokeClaudePhase()` | Same pattern as brainstorm; no duplication |
| 3 | spec.md storage | `docs/spec-*.md` / `plans/<plan-dir>/spec.md` | `plans/<plan-dir>/spec.md` | plans/ = execution truth per roadmap design rule |
| 4 | Skill file size | Large/comprehensive / Small/opinionated | Small/opinionated (<150 lines) | KISS; debrief is a separate concern |
| 5 | Brainstorm relationship | Replace / Parallel / Complementary | Complementary — grill-me is spec gate, brainstorm is exploration | Keep brainstorm for open exploration; grill-me forces decisions |

## Deferred / Open Questions

- Poll-safe marker for future watcher rollout (issue label vs bot comment vs plan artifact path vs run-state file) — deferred to later roadmap phase
- `--repo` flag for grill-me (creating GitHub issue from spec) — not needed in v1

## Risks

- `invokeClaudePhase()` signature may differ slightly from what brainstormer.ts uses — verify during phase-02 implementation
- Skill resolution: ensure `/grill-me` maps to `.claude/skills/grill-me/SKILL.md` correctly in local Claude skill loading

## Acceptance Criteria

- [ ] `claude-swarm grill-me "some topic"` executes without error
- [ ] `claude-swarm grill-me --help` shows correct description and `--context`, `--model`, `--plan-dir` options
- [ ] `.claude/skills/grill-me/SKILL.md` exists and asks 8–15 focused questions
- [ ] Skill writes `plans/<plan-dir>/spec.md` with required frontmatter and sections
- [ ] Skill hands off with `/ck:plan --fast` recommendation after spec is written
- [ ] All existing commands (`watch`, `brainstorm`, `build`, etc.) still work
- [ ] TypeScript build passes with no errors
