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
| 18 | Remove `/ck:ship` from ship-flow — moved to post-ship verify gate | Pending |
| 19 | Add `--skip-test` routing for DOCS/CHORE issues | Pending |
| 20 | Ship-flow ends at commitChanges() — NO push, NO PR | Pending |

**New ship-flow (stops at commit — no PR here):**
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
  └── commitChanges() ← STOP HERE. No push. No PR.
      (PR created later by /ck:ship in post-ship verify gate)
```

---

## Phase 3 — Green Testing (test-flow.ts)

**Goal**: Functional testing — does the code work correctly?
**Track**: Green testing (Thierry's term)

| # | Task | Status |
|---|---|---|
| 21 | Create `test-flow.ts` as new phase module | Pending |
| 22 | Add `/ck:scenario` — generate BDD/Gherkin test scenarios from issue | Pending |
| 23 | Add `/ck:test` — run unit + integration tests | Pending |
| 24 | Add `/ck:test --e2e` — browser E2E tests (wire to e2e-runner.ts) | Pending |
| 25 | Add `/ck:test --ui` — visual UI tests | Pending |
| 26 | Route test type based on issue labels and content | Pending |

**Green testing flow:**
```
GREEN = "does it work?"
  │
  ├── /ck:scenario (generate test cases from issue)
  ├── /ck:test (unit + integration)
  │
  ├── "frontend" label → /ck:test --ui
  ├── has E2E scenarios → /ck:test --e2e
  │
  └── report: GREEN PASS / GREEN FAIL
```

---

## Phase 4 — Red Testing (security-flow.ts)

**Goal**: Security testing — can the new code be hacked?
**Track**: Red testing (Thierry's term)

| # | Task | Status |
|---|---|---|
| 27 | Create `security-flow.ts` as new phase module | Pending |
| 28 | Add `/ck:security-scan` — OWASP + secrets + dependency scan | Pending |
| 29 | Add `/ck:code-review --security` — deep security review | Pending |
| 30 | Add `/ck:fix --security` — auto-fix security issues | Pending |
| 31 | Add `/ck:security` — full STRIDE threat modeling | Pending |
| 32 | Add `/ck:plan red-team` — adversarial plan review (think like attackers) | Pending |
| 33 | Wire into post-ship: always run green first, then red | Pending |

**Red testing flow:**
```
RED = "can it be hacked?"
  │
  ├── /ck:security-scan (OWASP + secrets + deps)
  ├── /ck:code-review --security (deep security review)
  ├── /ck:security (STRIDE threat modeling)
  ├── /ck:plan red-team (adversarial: think like attackers)
  │
  ├── issues found? → /ck:fix --security (auto-fix)
  └── report: RED PASS / RED FAIL
```

---

## Green + Red Combined in Post-Ship

```
after implementation commits:
  │
  ├── GREEN TESTING (Phase 3)
  │   ├── /ck:scenario → /ck:test → /ck:test --e2e
  │   └── GREEN PASS / GREEN FAIL
  │
  ├── RED TESTING (Phase 4) — only if GREEN PASS
  │   ├── /ck:security-scan → /ck:code-review --security
  │   ├── /ck:security (STRIDE) → /ck:plan red-team
  │   └── RED PASS / RED FAIL
  │
  ├── GATE: only if GREEN PASS + RED PASS
  │   └── /ck:ship --official (verify + PR)
  │       └── fallback: branch-manager createPullRequest()
  │
  ├── slack-reporter → report green/red results
  └── journal-writer → vault
```

---

## Model & Effort Routing (Flexible)

**Goal**: Configurable model + effort per phase, not hardcoded.

**3 levels of override (highest wins):**
```
CLI flag (--model opus --effort high)  >  .claude-swarm.json  >  model-router.ts defaults
```

**Default routing table** (in model-router.ts):

| Phase | Model | Effort | Why |
|---|---|---|---|
| brainstorm | opus | max | Deep creative thinking |
| plan | opus | high | Architectural reasoning |
| plan red-team | opus | high | Adversarial review |
| fix | sonnet | medium | Code execution |
| cook | sonnet | medium | Code execution |
| test (green) | sonnet | low | Run and report |
| e2e (green) | sonnet | low | Browser automation |
| security (red) | sonnet | medium | Security analysis |
| red-team (red) | opus | high | Think like attackers |
| scout | sonnet | low | File discovery |
| predict | opus | high | 5-persona debate |
| ship | sonnet | medium | Test + review + PR |
| report | haiku | low | Format and send |
| journal | haiku | low | Summarize to vault |
| retro | sonnet | medium | Sprint reflection |

**Config override** (`.claude-swarm.json`):
```json
{
  "models": {
    "plan": { "model": "opus", "effort": "high" },
    "cook": { "model": "sonnet", "effort": "medium" },
    "fix": { "model": "sonnet", "effort": "medium" },
    "test": { "model": "sonnet", "effort": "low" },
    "security": { "model": "sonnet", "effort": "medium" },
    "red-team": { "model": "opus", "effort": "high" },
    "report": { "model": "haiku", "effort": "low" }
  }
}
```

**CLI override**:
```bash
# Override all to sonnet low (save money)
claude-swarm watch --auto --model sonnet --effort low

# Override just effort (keep per-phase model routing)
claude-swarm watch --auto --effort low
```

| # | Task | Status |
|---|---|---|
| M1 | Refactor model-router.ts to read from .claude-swarm.json first, then defaults | Pending |
| M2 | Add --model and --effort CLI flags to watch command | Pending |
| M3 | Add --model and --effort CLI flags to builder commands | Pending |
| M4 | CLI flag overrides config overrides defaults (3-level chain) | Pending |
| M5 | Add "red-team" and "security" phase configs to model-router | Pending |

---

## Phase 5 — Upgrade verifier.ts → Verify + Ship Gate

**Goal**: `/ck:ship` IS the verification gate. Falls back to branch-manager if it fails.

**Key decision**: `/ck:ship` includes test + 2-pass review (standard + red-team) + version bump + changelog + PR. It replaces both the old verifier review AND the old createPullRequest(). branch-manager.ts `createPullRequest()` is kept UNTOUCHED as fallback.

| # | Task | Status |
|---|---|---|
| 33 | Add `/ck:scout` before `/ck:ship` (edge case discovery) | Pending |
| 34 | Add `/ck:predict` for impact assessment on large changes | Pending |
| 35 | Wire `/ck:ship --official` as PRIMARY verify + PR path | Pending |
| 36 | On `/ck:ship` failure → FALLBACK to `createPullRequest()` from branch-manager.ts | Pending |
| 37 | Keep branch-manager.ts `createPullRequest()` UNTOUCHED (rollback safety) | Pending |
| 38 | Log which path was used: "shipped via /ck:ship" or "shipped via fallback" | Pending |
| 39 | PASS = /ck:ship succeeds (PR created). FAIL = both /ck:ship and fallback fail | Pending |

**New verify gate (in post-ship-runner.ts):**
```
after debug-flow or ship-flow commits:
  │
  ├── e2e-runner   → /ck:test --e2e (if --base-url)
  ├── security     → /ck:security-scan (if "security" label)
  │
  ├── /ck:scout    → edge case discovery
  ├── /ck:predict  → 5-persona impact debate (large changes only)
  │
  ├── TRY: /ck:ship --official
  │   ├── merge main
  │   ├── run tests
  │   ├── 2-pass review (standard + red-team)
  │   ├── bump version + changelog
  │   ├── push + create PR
  │   └── SUCCESS → PASS
  │
  ├── CATCH: /ck:ship failed
  │   └── FALLBACK: branch-manager.ts createPullRequest()
  │       └── git push + gh pr create (old code, untouched)
  │
  ├── slack-reporter → report result
  └── journal-writer → vault
```

---

## Phase 6 — Upgrade Builder Tool

**Goal**: Builder uses VividKit commands for roadmap generation and execution.

| # | Task | Status |
|---|---|---|
| 40 | `build generate` uses `/ck:brainstorm` → `/ck:plan --hard` for roadmap creation | Pending |
| 41 | `build run` uses `/ck:cook @plan.md --auto` per issue (already correct) | Pending |
| 42 | `build run` adds `/ck:test` after cook (already correct) | Pending |
| 43 | `build run` uses `/ck:ship --official` as verify + PR (fallback to branch-manager) | Pending |
| 44 | `build run --hard` adds `/ck:plan red-team` and `/ck:predict` per epic | Pending |
| 45 | `build generate` adds `/ck:scenario` to generate test cases in roadmap | Pending |

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

| Phase | What | Track | Files | Tasks |
|---|---|---|---|---|
| 1 | Upgrade debug-flow.ts | — | `debug-flow.ts` | 10 |
| 2 | Upgrade ship-flow.ts (no PR here) | — | `ship-flow.ts` | 10 |
| 3 | Green Testing (functional) | GREEN | `test-flow.ts` (new) | 6 |
| 4 | Red Testing (security/hacking) | RED | `security-flow.ts` (new) | 7 |
| 5 | Verify + Ship gate (/ck:ship + fallback) | — | `post-ship-runner.ts`, `verifier.ts` | 7 |
| 6 | Upgrade builder | — | `epic-executor.ts` | 6 |
| 7 | Watcher integration | — | `watch-command.ts`, `issue-router.ts`, `model-router.ts` | 6 |
| M | Model + effort routing (flexible) | — | `model-router.ts`, `.claude-swarm.json` | 5 |
| **Total** | | | **9 files (2 new, 7 upgraded)** | **57 tasks** |

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
