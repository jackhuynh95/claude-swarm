# Build Phases Guide

How to use `build-phases.sh` to implement claude-swarm step by step.

---

## Quick Start

```bash
cd ~/Documents/GitHub/claude-swarm

# Preview all commands (no execution)
./build-phases.sh --dry-run

# Run Phase 0+1 (Foundation)
./build-phases.sh --phase 0 --auto
```

---

## Run One Phase at a Time

```bash
./build-phases.sh --phase 0 --auto   # Foundation + CK v2.14 migration
./build-phases.sh --phase 2 --auto   # Issue Router (BUG/FEATURE/DOCS)
./build-phases.sh --phase 3 --auto   # Execution Flows (debug→fix→test)
./build-phases.sh --phase 4 --auto   # Post-Ship (verifier, E2E, Slack, journal)
./build-phases.sh --phase 5 --auto   # Standalone CLI tools
./build-phases.sh --phase 6 --auto   # Safety (secrets filter, budget)
./build-phases.sh --phase 7 --auto   # Obsidian Vault integration
./build-phases.sh --phase 8 --auto   # Operator UX (status, history)
```

Check results after each phase before moving to the next.

---

## What Each Phase Does Internally

```
Step 1: /ck:plan (opus, high effort)     → creates implementation plan
Step 2: /ck:cook --auto (sonnet, medium) → implements the plan
Step 3: /test (sonnet, low)              → runs tests
Step 4: /git:cm (sonnet, low)            → commits changes
```

Phase 3 (hard) adds:
- `/ck:plan red-team` → adversarial review of plan
- Code review after implementation

Phase 6 adds:
- `/ck:security-scan` → OWASP security audit

---

## All Flags

| Flag | What It Does | Example |
|---|---|---|
| `--phase N` | Run single phase | `--phase 0` |
| `--from N` | Resume from phase N | `--from 3` |
| `--auto` | Skip confirmations + auto-approve permissions | `--auto` |
| `--dry-run` | Show commands without executing | `--dry-run` |
| `--budget N` | Max USD per phase (default: 3.00) | `--budget 5.00` |
| `--hard` | Enable red-team review | `--phase 3 --hard` |
| `--ship-to` | Ship target: beta or official | `--ship-to official` |

---

## Examples

```bash
# Preview everything
./build-phases.sh --dry-run

# Single phase, interactive (asks before each step)
./build-phases.sh --phase 0

# Single phase, fully automated
./build-phases.sh --phase 0 --auto

# All phases, fully automated, $5 budget per phase
./build-phases.sh --auto --budget 5.00

# Resume from Phase 3
./build-phases.sh --from 3 --auto

# Phase 3 with red-team review
./build-phases.sh --phase 3 --hard --auto

# Ship final phases to main
./build-phases.sh --phase 8 --auto --ship-to official
```

---

## Safety Built In

| Protection | How |
|---|---|
| Permission mode | `--permission-mode auto` (not `--dangerously-skip-permissions`) |
| Budget cap | `--max-budget-usd` per step (hard stop) |
| Tool gating | `--allowedTools` restricts tools per phase |
| Model routing | opus = thinking, sonnet = coding, haiku = reporting |
| Confirmation | Without `--auto`, asks before each step |

---

## What Gets Built Per Phase

| Phase | Creates | Files |
|---|---|---|
| 0+1 | Project structure, labels, CLAUDE.md, vault skeleton | package.json, tsconfig.json, obsidian-vault/ |
| 2 | Issue router, model router | issue-router.ts, model-router.ts |
| 3 | Debug flow, ship flow, subprocess spawning | debug-flow.ts, ship-flow.ts, clarifier.ts |
| 4 | Verifier, E2E, Slack reporter, journal writer (skill-backed via /2nd-brain:obsidian-journal) | verifier.ts, e2e-runner.ts, slack-reporter.ts, journal-writer.ts |
| 5 | Standalone CLI tools | slack-reader.ts, brainstormer.ts |
| 6 | Safety filters, budget guards | safety-filter.ts, budget-guard.ts |
| 7 | Obsidian journal skill, flat vault folders, context loading | /2nd-brain:obsidian-journal skill, vault read/write; folders: Daily/, Notes/, Review/, Runs/, Knowledge/ |
| 8 | Status command, run history | status.ts, capability-matrix.md |

---

## Cost Estimate

| Phase | Model Usage | Est. Cost |
|---|---|---|
| 0+1 | opus (plan) + sonnet (code) | ~$3 |
| 2 | opus (plan) + sonnet (code) | ~$2 |
| 3 | opus (plan+red-team) + sonnet (code+review) | ~$4 |
| 4 | opus (plan) + sonnet (code) | ~$3 |
| 5 | opus (plan) + sonnet (code) | ~$2 |
| 6 | opus (plan) + sonnet (code+security) | ~$3 |
| 7 | opus (plan) + sonnet (code) | ~$2 |
| 8 | opus (plan) + sonnet (code+review) | ~$3 |
| **Total** | | **~$22** |

---

## Logs

All output is logged to `logs/build-YYYYMMDD-HHMMSS.log`.

```bash
# View latest log
ls -t logs/build-*.log | head -1 | xargs cat
```

---

## Related Docs

| Doc | What |
|---|---|
| [implement-roadmap.md](./implement-roadmap.md) | Full plan — 9 phases, 56 tasks |
| [execution-playbook.md](./execution-playbook.md) | Manual step-by-step per phase |
| [agent-token-budget-guide.md](./agent-token-budget-guide.md) | Model routing + budget controls |
| [claude-cli-flag-reference.md](./claude-cli-flag-reference.md) | All CLI flags for cost optimization |
| [enhancement-priorities.md](./enhancement-priorities.md) | Scope agreement + priorities |
