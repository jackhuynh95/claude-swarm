---
date: 2026-04-14
slug: update-docs-grill-me-debrief-builder-workflow
status: complete
blockedBy: []
blocks: []
---

# Plan: Update Docs for Grill-Me + Debrief Builder Workflow

**Mode**: fast
**Scope**: Docs-only — no code changes
**Goal**: Update README, cli-usage-guide, and roadmap doc to surface the new-topic builder workflow (grill-me → spec.md → ck:plan → ck:cook → debrief). Keep existing generated guides compatible.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | README.md — Add spec-first workflow section and update diagrams | complete | [phase-01-readme-updates.md](phase-01-readme-updates.md) |
| 2 | cli-usage-guide.md — Add grill-me + debrief commands | complete | [phase-02-cli-usage-guide-updates.md](phase-02-cli-usage-guide-updates.md) |
| 3 | implement-roadmap-grill-me-debrief.md — Update G6 task statuses + builder workflow note | complete | [phase-03-roadmap-doc-updates.md](phase-03-roadmap-doc-updates.md) |

## Key Constraints

- Do NOT rewrite old topic instructions or break existing generated guides
- Apply new grill-me path only to new topics going forward
- Watcher flow stays unchanged — do not document watcher grill-me integration (deferred)

## Cook Command

```bash
/ck:cook plans/260414-1643-update-docs-grill-me-debrief-builder-workflow/plan.md --fast
```
