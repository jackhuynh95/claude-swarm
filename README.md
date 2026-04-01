# claude-swarm

Autonomous agent swarm for GitHub issue automation — CK watch core + smart routing, E2E testing, Slack ops, Obsidian vault as second brain.

Fork of [mrgoonie/claudekit-cli](https://github.com/mrgoonie/claudekit-cli) with auto-claude enhancements.

---

## What It Does

Claude-swarm is a **multi-track issue automation daemon** that watches GitHub issues and routes them to specialized workflows based on issue type:

```
GitHub Issues
  │
  ├── [BUG]           → Debug Flow: /debug → /fix → /test (retry loop)
  ├── [FEATURE]       → Ship Flow:  /plan:fast → /ck:cook --auto → PR
  ├── [DOCS/CHORE]    → Ship Flow:  /plan:fast → /ck:cook --no-test
  │
  └── Post-ship (all):
        ├── Verify     → independent agent (PASS/FAIL)
        ├── E2E        → agent-browser testing
        ├── Slack      → /slack-report to team
        └── Journal    → Obsidian vault daily + lessons
```

## Architecture

```
┌────────────────────────────────────────────────┐
│  Obsidian Vault (Human Knowledge Layer)        │
│  Daily/ · Notes/ · Review/ · Decisions/        │
├────────────────────────────────────────────────┤
│  Claude Native Memory (Runtime Continuity)     │
│  .claude/memory/ · CLAUDE.md · /dream          │
├────────────────────────────────────────────────┤
│  CK Watch Daemon (Orchestration — from fork)   │
│  State persistence · Process lock · Rate limit │
│  Approval gate · Worktree isolation · Timeout  │
├────────────────────────────────────────────────┤
│  Issue Router (auto-claude brain)              │
│  Type routing · Label routing · Model routing  │
├────────────────────────────────────────────────┤
│  Execution Flows                               │
│  debug-flow · ship-flow · verify-flow          │
├────────────────────────────────────────────────┤
│  Post-Ship: verifier · e2e · slack · journal   │
├────────────────────────────────────────────────┤
│  Standalone CLI Tools                          │
│  slack-reader · brainstormer · status          │
└────────────────────────────────────────────────┘
```

## What's Kept from CK Watch

- Daemon loop with configurable poll interval
- `.ck.json` state persistence and crash recovery
- Process lock (no duplicate daemons)
- Rate limiting (per-hour API caps)
- Timeout enforcement (SIGTERM → 5s → SIGKILL)
- Approval gates (owner comment to proceed)
- Worktree isolation (parallel issue handling)

## What's Added (Auto-Claude Enhancements)

| Capability | Description |
|---|---|
| **Issue type routing** | [BUG] → debug flow, [FEATURE] → ship flow, [DOCS] → no-test |
| **Model routing** | opus for thinking, sonnet for coding, haiku for formatting |
| **Debug → Fix → Test loop** | Root cause analysis with retry on failure |
| **E2E browser testing** | agent-browser verification after implementation |
| **Slack integration** | Read tasks from Slack, report results to team |
| **Obsidian vault** | Daily journals + lesson extraction as second brain |
| **Design review** | Frontend UI review (manual trigger only) |
| **Verifier agent** | Independent PASS/FAIL check before reporting |
| **Smart label routing** | "hard" → opus, "frontend" → design review |
| **Budget guards** | Per-worker token caps, nightly cost summary |
| **Safety filters** | Secrets stripping, AI disclaimer, loop prevention |

## Quick Start

```bash
# Clone
git clone https://github.com/jackhuynh/claude-swarm.git
cd claude-swarm

# Build all phases (interactive, with confirmation between each)
./build-phases.sh

# Build specific phase
./build-phases.sh --phase 0

# Build all phases overnight (YOLO)
./build-phases.sh --auto --budget 5.00

# Dry run (see commands without executing)
./build-phases.sh --dry-run
```

## Build Phases

| Phase | What | Tasks |
|---|---|---|
| 0+1 | Foundation + CK v2.14.0 migration | 15 |
| 2 | Issue Router (replace single-track /ck:cook) | 6 |
| 3 | Execution Flows (debug-flow + ship-flow) | 6 |
| 4 | Post-Ship (verifier, E2E, Slack, journal) | 6 |
| 5 | Standalone CLI (slack-reader, brainstormer) | 4 |
| 6 | Safety (secrets filter, budget, disclaimer) | 8 |
| 7 | Obsidian Vault (/obsidian-journal, context loading) | 6 |
| 8 | Operator UX (status command, run history) | 5 |

See [docs/implement-roadmap.md](docs/implement-roadmap.md) for full details.

## Docs

| Doc | Purpose |
|---|---|
| [implement-roadmap.md](docs/implement-roadmap.md) | Full roadmap — 9 phases, 56 tasks, capability matrix |
| [execution-playbook.md](docs/execution-playbook.md) | Step-by-step commands per phase |
| [agent-token-budget-guide.md](docs/agent-token-budget-guide.md) | Model routing, tool gating, budget controls |

## Model Routing

| Role | Model | Effort | Why |
|---|---|---|---|
| Brainstorm | opus | max | Deep creative thinking |
| Plan | opus | high | Architectural reasoning |
| Debug | opus | high | Root cause analysis |
| Fix / Cook | sonnet | medium | Code execution |
| Test / E2E | sonnet | low | Run and report |
| Slack report | haiku | low | Format and send |
| Journal | haiku | low | Summarize to vault |

## Memory Model

Hybrid approach — Obsidian for humans, /dream for Claude:

- **Obsidian vault** (`obsidian-vault/`): Specs, journals, lessons, decisions — human-readable, git-versioned
- **Claude memory** (`.claude/memory/`): Session continuity, auto-memory, /dream consolidation

Rule: if humans must read it → Obsidian. If Claude needs continuity → /dream.

## Requirements

- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- Node.js / Bun runtime
- Git

## License

MIT — see [LICENSE](LICENSE)

## Credits

- Fork of [ClaudeKit CLI](https://github.com/mrgoonie/claudekit-cli) by mrgoonie
- Auto-claude pipeline by Jack Huynh
- Research contributions from team collaborators
