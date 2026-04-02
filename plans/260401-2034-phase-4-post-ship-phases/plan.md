# Phase 4: Post-Ship Phases (Auto-Claude Exclusives)

**Created**: 2026-04-01
**Status**: Complete
**CompletedOn**: 2026-04-01
**Priority**: High
**Mode**: Fast
**blockedBy**: []
**blocks**: []

---

## Overview

Add 5 post-ship phase modules that run AFTER debug-flow/ship-flow complete. These are the "moat" — capabilities CK doesn't have. Sequence: verify -> e2e -> design-review (if frontend) -> slack-report -> journal.

All modules follow the established Phase 3 pattern: export async function, accept ClassifiedIssue + Config, return PhaseResult[], use `invokeClaudePhase()` for Claude CLI calls, `addComment()`/`transitionLabel()` for GitHub ops.

## Existing Infrastructure (No Changes Needed)

- **types.ts**: PhaseType already has `'verify' | 'e2e' | 'slack_report' | 'journal'` — all covered
- **model-router.ts**: Configs already defined for all 4 phase types (verify=sonnet/180s, e2e=sonnet/180s, slack_report=haiku/30s, journal=haiku/30s)
- **claude-invoker.ts**: `invokeClaudePhase()` works for all new modules
- **label-manager.ts**: TRANSITIONS has `verified`, `needsRefix` — covers verifier outcomes

## Required Type Change

Add `'design_review'` to `PhaseType` in types.ts + add config in model-router.ts (sonnet, medium effort, 3 turns, 180s, Read/Grep/Glob tools). Design-reviewer needs distinct phase identity for metrics/logging.

## Phases

| # | Phase | File | Status |
|---|---|---|---|
| 1 | Verifier | [phase-01-verifier.md](phase-01-verifier.md) | Complete |
| 2 | E2E Runner | [phase-02-e2e-runner.md](phase-02-e2e-runner.md) | Complete |
| 3 | Slack Reporter | [phase-03-slack-reporter.md](phase-03-slack-reporter.md) | Complete |
| 4 | Design Reviewer | [phase-04-design-reviewer.md](phase-04-design-reviewer.md) | Complete |
| 5 | Journal Writer | [phase-05-journal-writer.md](phase-05-journal-writer.md) | Complete |
| 6 | Watcher Wiring | [phase-06-watcher-wiring.md](phase-06-watcher-wiring.md) | Complete |

## Post-Ship Execution Order

```
Flow completes (debug-flow or ship-flow)
  │
  ├─ 1. verifier.ts        → PASS/FAIL/PARTIAL verdict
  │     ├─ FAIL → label needs_refix, stop post-ship
  │     └─ PASS/PARTIAL → continue
  │
  ├─ 2. e2e-runner.ts      → agent-browser E2E (skip if no e2e config)
  │     └─ FAIL → label needs_refix, stop post-ship
  │
  ├─ 3. design-reviewer.ts → only if 'frontend'/'ui' label (optional)
  │     └─ Posts review comment, never blocks
  │
  ├─ 4. slack-reporter.ts  → /slack-report summary to team
  │
  └─ 5. journal-writer.ts  → obsidian-vault Daily + Notes
```

## Dependencies

- Phase 3 complete (debug-flow, ship-flow, claude-invoker, label-manager, branch-manager)
- `gh` CLI for GitHub operations
- `agent-browser` CLI for E2E testing (e2e-runner)
- obsidian-vault directory structure (journal-writer)

## State Lifecycle Integration

Post-ship phases map to states defined in types.ts:
- `verifying` → verifier.ts running
- `e2e_testing` → e2e-runner.ts running
- `reporting` → slack-reporter.ts running
- `journaling` → journal-writer.ts running
- `completed` → all post-ship phases done

State tracked via labels (consistent with Phase 3 approach).

## Success Criteria

- [x] verifier.ts returns PASS/FAIL/PARTIAL, posts verdict, transitions labels
- [x] e2e-runner.ts invokes agent-browser, reports results
- [x] slack-reporter.ts sends summary via /slack-report skill
- [x] design-reviewer.ts reviews UI changes (frontend label only), posts findings
- [x] journal-writer.ts writes to obsidian-vault/Daily/ and extracts Notes
- [x] All 5 modules wired into watch-command post-ship sequence
- [x] `npm run build` compiles without errors
- [x] Verifier FAIL stops post-ship pipeline (fail-fast)

## Estimated Effort

~3-4 hours (6 files, ~500-700 LOC total)
