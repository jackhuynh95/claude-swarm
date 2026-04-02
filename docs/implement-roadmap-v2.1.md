# Claude-Swarm v2.1 Implementation Roadmap

**Date**: 2026-04-02
**Base**: v0.4.0 (all v2.0 phases complete — 21 phase modules, 3 CLI tools)
**Approach**: 4-layer GitHub hierarchy — Milestone → Epic → Issue → Sub-Issue

---

## 4-Layer Hierarchy

```
Milestone: v2.1
│
├── Epic: "Integration Testing & Hardening"
│   ├── Issue: "Wire watch loop to real repo"
│   │   ├── Sub: Configure test repo
│   │   ├── Sub: Run full poll cycle
│   │   └── Sub: Verify state persistence
│   └── Issue: "E2E test all flows"
│       ├── Sub: Test debug-flow end-to-end
│       └── Sub: Test ship-flow end-to-end
│
├── Epic: "Test Framework & CI/CD"
│   └── ...
│
└── Epic: "Production Hardening"
    └── ...

Rules:
  Milestone  = release boundary (v2.1)
  Epic       = big goal, tracker only, watcher SKIPS
  Issue      = PR-sized work, watcher PICKS UP
  Sub-Issue  = granular task within an issue
```

---

## Milestone: claude-swarm v2.1

### Epic 1 — Integration Testing & Hardening

**Goal**: Prove all 21 modules work together against a real GitHub repo.

| Issue | Sub-Issues | Type | Flow |
|---|---|---|---|
| Wire watch loop to real repo | | feature | ship |
| | Configure test repo with sample issues | | |
| | Run full poll→classify→execute cycle | | |
| | Verify .ck.json state persistence + crash recovery | | |
| E2E test debug-flow | | feature | ship |
| | Create [BUG] issue, verify /debug→/fix→/test fires | | |
| | Verify retry loop (inject failing test, confirm 3 retries) | | |
| | Verify label transition ready_for_dev→shipped | | |
| E2E test ship-flow | | feature | ship |
| | Create [FEATURE] issue, verify /ck:plan→/ck:cook fires | | |
| | Verify branch creation + commit + PR | | |
| | Verify label transition ready_for_dev→shipped | | |
| E2E test clarifier | | feature | ship |
| | Create vague issue, verify clarify questions posted | | |
| | Reply to clarify, verify planning continues | | |
| E2E test post-ship pipeline | | feature | ship |
| | Verify verifier.ts runs after implementation | | |
| | Verify e2e-runner.ts triggers agent-browser | | |
| | Verify slack-reporter.ts sends to channel | | |
| | Verify journal-writer.ts writes to vault | | |
| Test issue-router classification | | feature | ship |
| | [BUG] → debug-flow confirmed | | |
| | [FEATURE] → ship-flow confirmed | | |
| | [DOCS] → ship-flow --no-test confirmed | | |
| | "hard" label → opus override confirmed | | |
| | "frontend" label → design review confirmed | | |
| | Epic label → SKIP confirmed | | |

---

### Epic 2 — Test Framework & CI/CD

**Goal**: Automated test suite + GitHub Actions pipeline.

| Issue | Sub-Issues | Type | Flow |
|---|---|---|---|
| Set up Bun test runner | | feature | ship |
| | Add `bun:test` to package.json | | |
| | Create test directory structure | | |
| | Add test:unit and test:integration scripts | | |
| Unit tests for core modules | | feature | ship |
| | Test issue-router.ts (type detection logic) | | |
| | Test model-router.ts (model selection per phase) | | |
| | Test label-manager.ts (transitions) | | |
| | Test budget-guard.ts (cap enforcement) | | |
| | Test comment-sanitizer.ts (secrets stripping) | | |
| | Test comment-guard.ts (loop prevention) | | |
| Unit tests for flow modules | | feature | ship |
| | Test debug-flow.ts (retry logic, phase ordering) | | |
| | Test ship-flow.ts (plan→cook→ship sequence) | | |
| | Test clarifier.ts (question posting, reply polling) | | |
| GitHub Actions CI pipeline | | feature | ship |
| | Create .github/workflows/ci.yml | | |
| | Run `tsc` build check on push | | |
| | Run `bun test` on push | | |
| | Run on PR to main | | |

---

### Epic 3 — Production Hardening

**Goal**: Make overnight runs reliable and observable.

| Issue | Sub-Issues | Type | Flow |
|---|---|---|---|
| Real-world permission testing | | feature | ship |
| | Test --permission-mode auto on overnight run | | |
| | Verify --allowedTools blocks unauthorized tool access | | |
| | Document any permission mode gaps | | |
| Budget guard integration test | | feature | ship |
| | Run 5-issue batch, verify cost tracking accuracy | | |
| | Test --max-budget-usd stops runaway calls | | |
| | Verify nightly cost summary output | | |
| State recovery testing | | feature | ship |
| | Kill daemon mid-issue, verify crash recovery | | |
| | Verify .ck.json resumes from last known state | | |
| | Test process lock prevents duplicate daemons | | |
| Safety filter validation | | feature | ship |
| | Inject fake API key in Claude output, verify stripping | | |
| | Verify AI disclaimer appears on all bot comments | | |
| | Verify comment-guard blocks self-reply loops | | |

---

### Epic 4 — GitHub Issue Hierarchy Support

**Goal**: Watcher understands 4-layer hierarchy natively.

| Issue | Sub-Issues | Type | Flow |
|---|---|---|---|
| Epic detection in issue-router | | feature | ship |
| | Detect "epic" label → skip (tracker only) | | |
| | Detect parent/child relationship via GitHub API | | |
| | Log skipped epics in state | | |
| Sub-issue support | | feature | ship |
| | Resolve sub-issue → parent issue link | | |
| | Close parent when all children done | | |
| | Update parent checklist when child closes | | |
| Milestone-aware routing | | feature | ship |
| | Filter issues by milestone (only process current milestone) | | |
| | Skip issues not in active milestone | | |
| Issue template creation | | feature | ship |
| | Create .github/ISSUE_TEMPLATE/epic.yml | | |
| | Create .github/ISSUE_TEMPLATE/feature.yml | | |
| | Create .github/ISSUE_TEMPLATE/bug.yml | | |

---

### Epic 5 — CLI Polish & npm Package

**Goal**: Clean CLI experience for `npx @jackhuynh95/claude-swarm`.

| Issue | Sub-Issues | Type | Flow |
|---|---|---|---|
| CLI help and version | | feature | ship |
| | `claude-swarm --help` shows all commands | | |
| | `claude-swarm --version` shows 2.1.0 | | |
| | Colored output with chalk | | |
| Init command | | feature | ship |
| | `claude-swarm init` creates .ck.json + labels + vault | | |
| | Interactive prompts for repo config | | |
| | Generate CLAUDE.md from template | | |
| Status command improvements | | feature | ship |
| | Show active milestone progress | | |
| | Show per-epic completion % | | |
| | Show recent run history (last 10) | | |
| | Show cost summary (today / week / total) | | |

---

## build-phases-v2.1.sh

Same pattern as v2.0 — one phase per epic:

```bash
cd ~/Documents/GitHub/claude-swarm

# Epic 1: Integration Testing
./build-phases-v2.1.sh --epic 1 --auto --budget 20

# Epic 2: Test Framework & CI/CD
./build-phases-v2.1.sh --epic 2 --auto --budget 20

# Epic 3: Production Hardening
./build-phases-v2.1.sh --epic 3 --auto --budget 20

# Epic 4: Hierarchy Support
./build-phases-v2.1.sh --epic 4 --auto --budget 20

# Epic 5: CLI Polish
./build-phases-v2.1.sh --epic 5 --auto --budget 20

# All epics
./build-phases-v2.1.sh --auto --budget 20

# Resume from epic 3
./build-phases-v2.1.sh --from 3 --auto --budget 20

# Dry run
./build-phases-v2.1.sh --dry-run
```

---

## GitHub Setup Commands

```bash
# Create milestone
gh milestone create "v2.1" --repo jackhuynh95/claude-swarm \
  --description "Integration testing, CI/CD, production hardening, hierarchy support"

# Create epic labels
gh label create "epic" --color "6f42c1" --description "Epic — tracker only, watcher skips"
gh label create "sub-issue" --color "bfd4f2" --description "Sub-issue of a parent"

# Create epic issues (parent trackers)
gh issue create --title "Epic: Integration Testing & Hardening" --label "epic" --milestone "v2.1"
gh issue create --title "Epic: Test Framework & CI/CD" --label "epic" --milestone "v2.1"
gh issue create --title "Epic: Production Hardening" --label "epic" --milestone "v2.1"
gh issue create --title "Epic: GitHub Issue Hierarchy Support" --label "epic" --milestone "v2.1"
gh issue create --title "Epic: CLI Polish & npm Package" --label "epic" --milestone "v2.1"
```

---

## Summary

| | v2.0 (done) | v2.1 (next) |
|---|---|---|
| Structure | Flat phases in roadmap.md | 4-layer: Milestone→Epic→Issue→Sub |
| Tracking | Manual in markdown | GitHub Issues hierarchy |
| Epics | 9 phases | 5 epics |
| Issues | 56 tasks | ~25 issues |
| Sub-issues | None | ~50 sub-issues |
| Test coverage | None | Unit + integration + E2E |
| CI/CD | None | GitHub Actions |
| Hierarchy-aware | No | Watcher skips epics, processes leaves |
