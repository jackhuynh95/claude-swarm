# Post-Ship Pipeline Documentation Update

**Date**: 2026-04-03  
**Triggered by**: Post-ship phase refactor (executeVerify removal, scout/predict addition, /ck:ship primary path)

---

## Changes Made

### 1. `docs/agent-token-budget-guide.md`

#### Model Routing Table
Added three new phases post-ship pipeline restructure:
- **Scout** (sonnet, low, 3 turns) — Edge case discovery, read-only
- **Predict** (opus, high, 5 turns) — 5-persona impact debate (hardMode issues only)
- **Ship** (sonnet, medium, 5 turns) — Replaces old verify; handles test→review→PR via /ck:ship

Removed `Verify` entry (no longer a standalone phase; folded into ship).

#### Tool Gating Table
Added phase-to-tools mappings for scout, predict, ship.

#### Budget Controls
Added token/timeout configs for scout, predict, ship based on model-router.ts PHASE_CONFIGS.

### 2. `docs/execution-playbook.md`

#### Phase 4 Description
- Clarified post-ship tasks: security-flow, e2e-runner, slack-reporter, design-reviewer, journal-writer (verifier.ts removed from task list)
- Updated done-when criteria to reflect new post-ship orchestration: `security-scan → e2e → scout → predict (hard only) → /ck:ship (or fallback) → design-review → slack-report → journal`

---

## Implementation Basis (Code Verification)

**File**: `src/commands/watch/phases/post-ship-runner.ts` (lines 69-217)

Post-ship pipeline now orchestrates:
1. Security flow (advisory, never blocks)
2. E2E (FAIL stops pipeline; skipped if no baseUrl)
3. Scout phase (edge case discovery, advisory)
4. Predict phase (only if hardMode, 5-persona debate)
5. Ship phase via /ck:ship (with fallback to createPullRequest if fails)
6. Design review (advisory)
7. Slack report (best-effort)
8. Journal (always runs last)
9. LLMS docs generation (best-effort)
10. Run recorder (pure file write)

**Key behavior changes**:
- `executeVerify()` completely removed — no longer blocks pipeline
- `PostShipResult.verdict` simplified: `'PASS' | 'FAIL'` (was VerifyVerdict with PARTIAL state)
- `PostShipResult.shipPath` tracks PR creation path: `'ck-ship' | 'fallback' | 'none'`
- Predict phase conditional on `classified.flags.hardMode`

---

## Docs Impact Assessment

**Severity**: Minor to Moderate

| Aspect | Status | Notes |
|--------|--------|-------|
| Type definitions (PhaseType) | ✓ Updated | Added 'ship' and 'predict' to union |
| Phase configs | ✓ Updated | Added PHASE_CONFIGS entries for scout, predict, ship |
| Token budgets | ✓ Updated | Added budget entries for all three new phases |
| Pipeline orchestration | ✓ Updated | Documented new post-ship flow |
| Playbook Phase 4 | ✓ Updated | Execution steps clarified |
| Breaking changes | Documented | verify phase removed (advisory-only, not user-facing) |

---

## Files Updated

1. `/Users/jackhuynh/Documents/GitHub/claude-swarm/docs/agent-token-budget-guide.md`
   - Model Routing Table: Added Scout, Predict, Ship; removed Verify
   - Tool Gating Table: Added tool mappings for three new phases
   - Budget Controls: Added token/timeout config for scout, predict, ship

2. `/Users/jackhuynh/Documents/GitHub/claude-swarm/docs/execution-playbook.md`
   - Phase 4 section: Updated post-ship task list and done-when criteria

---

## Not Updated (Rationale)

- `docs/build-phases-guide.md` — Describes shell scripting interface, no changes needed (Phase 4 description there is generic "post-ship phases")
- `docs/implement-roadmap.md` — Already marked Phase 4 tasks as "Done"; no action item changes
- No new docs created — existing structure accommodates new phases via model-router.ts PHASE_CONFIGS

---

## Verification Checklist

- [x] Code changes verified in src/commands/watch/phases/post-ship-runner.ts
- [x] Type changes verified in src/commands/watch/types.ts (PhaseType union)
- [x] Model/effort configs verified in src/commands/watch/phases/model-router.ts (PHASE_CONFIGS)
- [x] Documentation updated in both affected files
- [x] No broken links (all updates internal)
- [x] No stale references to executeVerify() remain in docs

**Status**: COMPLETE — Post-ship pipeline documentation synced with implementation.
