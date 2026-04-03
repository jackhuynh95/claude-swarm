# VividKit Commands Integration Roadmap

**Date**: 2026-04-03
**Source**: VividKit Commands for Local Models + CK v2.14.0 Spec
**Goal**: Upgrade watcher flows + builder tool to use latest VividKit command set

---

## Current vs VividKit Commands

### debug-flow.ts (Bug Fixing)

```
CURRENT:
  /ck:debug → /ck:fix → /ck:test → retry x3

VIVIDKIT (6-step pipeline):
  /ck:fix (full pipeline = Scout → Diagnose → Assess → Fix → Verify → Prevent)
  
  Flags:
    --auto    auto-apply without confirmation
    --review  review fix before applying
    --quick   fast fix without deep analysis  
    --parallel fix multiple issues in parallel
    --security security-focused fix
    --hard    deep analysis for complex bugs
    --test    run test suite and fix failures
    --types   fix type errors
    --ci      fix CI/CD pipeline issues
    --ui      fix UI issues
    --logs    fix from log analysis
```

**Key change**: `/ck:fix` already includes scout + diagnose + assess + verify + prevent. No need for separate `/ck:debug` step — it's built into `/ck:fix`.

### ship-flow.ts (Feature Building)

```
CURRENT:
  /ck:plan --fast → /ck:cook --auto → commit → PR

VIVIDKIT (full recipe):
  /ck:brainstorm (if scope unclear)
  /ck:plan → /ck:plan validate → /ck:cook @plan.md
  /ck:scout (edge cases after cook)
  /ck:code-review (quality review)
  /ck:ship --official (test → review → bump version → changelog → PR)
```

**Key change**: `/ck:ship` replaces manual git push + PR creation. Includes test, review, version bump, changelog, PR — all in one.

### test-flow (Testing)

```
CURRENT:
  /ck:test (basic)

VIVIDKIT:
  /ck:scenario       BDD/Gherkin test generation
  /ck:test            unit + integration
  /ck:test --e2e      end-to-end browser tests
  /ck:test --ui       UI visual tests
```

### security-flow (New)

```
CURRENT:
  /ck:security-scan (basic)

VIVIDKIT (3-step audit):
  /ck:security-scan           OWASP + secrets + deps
  /ck:code-review --security  deep security review
  /ck:fix --security          auto-fix security issues
  /ck:security                STRIDE threat modeling + OWASP (full audit)
```

### review-flow (New)

```
CURRENT:
  verifier.ts (basic PASS/FAIL)

VIVIDKIT:
  /ck:scout               edge case discovery
  /ck:code-review         quality review
  /ck:code-review --parallel  multi-reviewer
  /ck:predict             5-persona impact debate (architect, security, perf, UX, ops)
```

---

## Phase 1 — Upgrade debug-flow.ts

**Goal**: Replace 3-step custom loop with VividKit's 6-step `/ck:fix` pipeline.

| # | Task | Status |
|---|---|---|
| 1 | Replace `/ck:debug → /ck:fix → /ck:test` with single `/ck:fix` call (includes all 6 steps) | Pending |
| 2 | Add `--hard` flag routing for "hard" labeled issues | Pending |
| 3 | Add `--quick` flag routing for simple bugs | Pending |
| 4 | Add `--parallel` flag for multiple related bugs | Pending |
| 5 | Add `--security` flag for security-labeled issues | Pending |
| 6 | Add `--ci` flag for CI/CD pipeline failures | Pending |
| 7 | Add `--ui` flag for frontend-labeled issues | Pending |
| 8 | Add `--logs` flag when issue includes log content | Pending |
| 9 | Keep retry loop but use `/ck:fix` per cycle instead of debug→fix→test | Pending |
| 10 | Add `/ck:problem-solving when-stuck` fallback after max retries | Pending |

**New debug-flow:**
```
classify issue labels/content
  │
  ├── "hard" label     → /ck:fix --hard
  ├── "security" label → /ck:fix --security
  ├── "frontend" label → /ck:fix --ui
  ├── CI failure       → /ck:fix --ci
  ├── has logs         → /ck:fix --logs
  └── default          → /ck:fix --auto
  │
  ├── retry on failure (max 3)
  └── /ck:problem-solving when-stuck (after max retries)
```

---

## Phase 2 — Upgrade ship-flow.ts

**Goal**: Use full VividKit recipe for feature building.

| # | Task | Status |
|---|---|---|
| 11 | Add optional `/ck:brainstorm` step when issue lacks clear spec | Pending |
| 12 | Replace `/ck:plan --fast` with `/ck:plan` (full plan) for complex features | Pending |
| 13 | Add `/ck:plan validate` step after plan creation | Pending |
| 14 | Add `/ck:plan red-team` for "hard" labeled features | Pending |
| 15 | Keep `/ck:cook @plan.md --auto` as implementation step | Pending |
| 16 | Add `/ck:scout` after cook for edge case discovery | Pending |
| 17 | Add `/ck:code-review` after cook for quality check | Pending |
| 18 | Replace manual git push + PR with `/ck:ship --official` or `--beta` | Pending |
| 19 | Add `--skip-test` routing for DOCS/CHORE issues | Pending |
| 20 | Add `/ck:predict` step for large features (5-persona impact debate) | Pending |

**New ship-flow:**
```
issue classified as FEATURE
  │
  ├── vague spec?  → /ck:brainstorm → clarify
  │
  ├── "hard" label → /ck:plan --hard → /ck:plan red-team
  ├── default      → /ck:plan --fast
  │
  ├── /ck:plan validate (optional, for complex features)
  │
  ├── /ck:cook @plan.md --auto
  │
  ├── /ck:scout (edge cases)
  ├── /ck:code-review
  │
  ├── large feature? → /ck:predict (5-persona debate)
  │
  └── /ck:ship --official (or --beta)
      ├── merge main
      ├── run tests
      ├── 2-pass review (standard + red-team)
      ├── bump version + changelog
      └── push + create PR
```

---

## Phase 3 — Add test-flow.ts (New Module)

**Goal**: Dedicated test flow using VividKit test commands.

| # | Task | Status |
|---|---|---|
| 21 | Create `test-flow.ts` as new phase module | Pending |
| 22 | Add `/ck:scenario` — generate BDD/Gherkin test scenarios from issue | Pending |
| 23 | Add `/ck:test` — run unit + integration tests | Pending |
| 24 | Add `/ck:test --e2e` — browser E2E tests (wire to e2e-runner.ts) | Pending |
| 25 | Add `/ck:test --ui` — visual UI tests | Pending |
| 26 | Route test type based on issue labels and content | Pending |

**test-flow:**
```
after implementation
  │
  ├── /ck:scenario (generate test cases from issue)
  ├── /ck:test (unit + integration)
  │
  ├── "frontend" label → /ck:test --ui
  ├── has E2E scenarios → /ck:test --e2e
  │
  └── report results
```

---

## Phase 4 — Add security-flow.ts (New Module)

**Goal**: Full security audit pipeline using VividKit security commands.

| # | Task | Status |
|---|---|---|
| 27 | Create `security-flow.ts` as new phase module | Pending |
| 28 | Add `/ck:security-scan` — OWASP + secrets + dependency scan | Pending |
| 29 | Add `/ck:code-review --security` — deep security review | Pending |
| 30 | Add `/ck:fix --security` — auto-fix security issues | Pending |
| 31 | Add `/ck:security` — full STRIDE threat modeling | Pending |
| 32 | Wire into post-ship when "security" label present | Pending |

**security-flow:**
```
"security" label detected
  │
  ├── /ck:security-scan (OWASP + secrets + deps)
  ├── /ck:code-review --security (deep review)
  ├── /ck:security (STRIDE threat modeling)
  │
  ├── issues found? → /ck:fix --security (auto-fix)
  └── report findings
```

---

## Phase 5 — Upgrade verifier.ts (Review Flow)

**Goal**: Use VividKit review commands for stronger verification.

| # | Task | Status |
|---|---|---|
| 33 | Add `/ck:scout` before verification (edge case discovery) | Pending |
| 34 | Replace basic review with `/ck:code-review` | Pending |
| 35 | Add `/ck:code-review --parallel` for multi-reviewer verification | Pending |
| 36 | Add `/ck:predict` for impact assessment on large changes | Pending |
| 37 | Keep PASS/FAIL/PARTIAL verdict system | Pending |

---

## Phase 6 — Upgrade Builder Tool

**Goal**: Builder uses VividKit commands for roadmap generation and execution.

| # | Task | Status |
|---|---|---|
| 38 | `build generate` uses `/ck:brainstorm` → `/ck:plan --hard` for roadmap creation | Pending |
| 39 | `build run` uses `/ck:cook @plan.md --auto` per issue (already correct) | Pending |
| 40 | `build run` adds `/ck:test` after cook (already correct) | Pending |
| 41 | `build run` uses `/ck:ship --official` for final commit + PR | Pending |
| 42 | `build run --hard` adds `/ck:plan red-team` and `/ck:predict` per epic | Pending |
| 43 | `build generate` adds `/ck:scenario` to generate test cases in roadmap | Pending |

---

## Phase 7 — Watcher Integration

**Goal**: Wire all new flows into watch-command.ts poll cycle.

| # | Task | Status |
|---|---|---|
| 44 | Update issue-router.ts to detect CI, logs, UI, security sub-types | Pending |
| 45 | Wire test-flow.ts into post-ship-runner.ts | Pending |
| 46 | Wire security-flow.ts into post-ship-runner.ts (when "security" label) | Pending |
| 47 | Update model-router.ts with new phase configs for test/security flows | Pending |
| 48 | Add `/ck:retro` call at end of nightly run (sprint retro summary) | Pending |
| 49 | Add `/ck:watzup` call at start of each poll cycle (recent changes summary) | Pending |

---

## Command Coverage Matrix

| VividKit Command | Watcher | Builder | Status |
|---|---|---|---|
| `/ck:brainstorm` | clarifier.ts | `build generate` | Existing (upgrade) |
| `/ck:plan` | ship-flow.ts | `build generate` | Existing (upgrade) |
| `/ck:plan --fast` | ship-flow.ts | `build run` | Existing |
| `/ck:plan --hard` | ship-flow.ts | `build run --hard` | Existing |
| `/ck:plan validate` | ship-flow.ts | — | New |
| `/ck:plan red-team` | ship-flow.ts | `build run --hard` | Existing |
| `/ck:cook` | ship-flow.ts | `build run` | Existing |
| `/ck:cook --auto` | ship-flow.ts | `build run --auto` | Existing |
| `/ck:cook --parallel` | ship-flow.ts | `build run` | New |
| `/ck:cook --no-test` | ship-flow.ts | `build run` | Existing |
| `/ck:fix` | debug-flow.ts | — | Upgrade (6-step) |
| `/ck:fix --hard` | debug-flow.ts | — | New |
| `/ck:fix --quick` | debug-flow.ts | — | New |
| `/ck:fix --parallel` | debug-flow.ts | — | New |
| `/ck:fix --security` | security-flow.ts | — | New |
| `/ck:fix --ci` | debug-flow.ts | — | New |
| `/ck:fix --ui` | debug-flow.ts | — | New |
| `/ck:fix --logs` | debug-flow.ts | — | New |
| `/ck:scout` | verifier.ts | — | New |
| `/ck:scenario` | test-flow.ts | `build generate` | New |
| `/ck:test` | test-flow.ts | `build run` | Existing (upgrade) |
| `/ck:test --e2e` | e2e-runner.ts | — | Existing |
| `/ck:test --ui` | test-flow.ts | — | New |
| `/ck:security-scan` | security-flow.ts | — | Existing (upgrade) |
| `/ck:security` | security-flow.ts | — | New (STRIDE) |
| `/ck:code-review` | verifier.ts | — | New |
| `/ck:code-review --security` | security-flow.ts | — | New |
| `/ck:code-review --parallel` | verifier.ts | — | New |
| `/ck:predict` | verifier.ts | `build run --hard` | New |
| `/ck:ship` | ship-flow.ts | `build run` | Existing (upgrade) |
| `/ck:ship --official` | ship-flow.ts | `build run` | Existing |
| `/ck:ship --beta` | ship-flow.ts | — | Existing |
| `/ck:git cm` | branch-manager.ts | `build run` | Existing |
| `/ck:git cp` | branch-manager.ts | `build run` | Existing |
| `/ck:git pr` | branch-manager.ts | — | Existing |
| `/ck:problem-solving` | debug-flow.ts | — | New |
| `/ck:retro` | watch-command.ts | — | New |
| `/ck:watzup` | watch-command.ts | — | New |
| `/ck:llms` | post-ship | — | Existing |
| `/ck:docs init` | — | `build generate` | New |
| `/ck:docs update` | post-ship | — | New |

---

## Summary

| Phase | What | Files | Tasks |
|---|---|---|---|
| 1 | Upgrade debug-flow.ts | `debug-flow.ts` | 10 |
| 2 | Upgrade ship-flow.ts | `ship-flow.ts` | 10 |
| 3 | Add test-flow.ts | `test-flow.ts` (new) | 6 |
| 4 | Add security-flow.ts | `security-flow.ts` (new) | 6 |
| 5 | Upgrade verifier.ts | `verifier.ts` | 5 |
| 6 | Upgrade builder | `epic-executor.ts` | 6 |
| 7 | Watcher integration | `watch-command.ts`, `issue-router.ts`, `model-router.ts` | 6 |
| **Total** | | **7 files (2 new, 5 upgraded)** | **49 tasks** |

---

## Build Script

```bash
cd ~/Documents/GitHub/claude-swarm

# Use build-from-specs.sh pattern — same approach
# Or inline:
claude -p "/ck:plan --fast @docs/implement-roadmap-vividkit-commands.md Phase 1: upgrade debug-flow.ts" \
  --model opus --effort high --max-budget-usd 10 --dangerously-skip-permissions

claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet --effort medium --max-budget-usd 10 --dangerously-skip-permissions
```
