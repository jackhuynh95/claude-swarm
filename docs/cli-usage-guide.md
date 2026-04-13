# claude-swarm CLI Usage Guide

## Installation

```bash
# Configure GitHub Packages registry
echo "@jackhuynh95:registry=https://npm.pkg.github.com" >> .npmrc

# Install globally
npm install -g @jackhuynh95/claude-swarm

# Or run directly via npx
npx @jackhuynh95/claude-swarm watch --dry-run
```

## Usage

```bash
# Run from any project root — repo auto-detected from git remote
cd ~/my-project
claude-swarm watch --auto

# Or specify repo explicitly
claude-swarm watch --repo owner/repo --auto
```

## Project Config (`.claude-swarm.json`)

Create `.claude-swarm.json` in your project root for persistent defaults:

```json
{
  "repo": "myorg/myapp",
  "vault": "../second-brain",
  "brain": "../second-brain",
  "baseUrl": "http://localhost:3000",
  "interval": 60000,
  "maxPerHour": 10,
  "redTeam": true,
  "models": {
    "plan": { "model": "opus", "effort": "high" },
    "cook": { "model": "sonnet", "effort": "medium" },
    "fix": { "model": "sonnet", "effort": "medium" },
    "test": { "model": "sonnet", "effort": "low" },
    "security": { "model": "sonnet", "effort": "medium" },
    "red-team": { "model": "opus", "effort": "high" }
  }
}
```

**Resolution priority:** CLI flag > `.claude-swarm.json` > git remote auto-detect.

### Model & Effort Overrides

The 3-level override chain:

1. **CLI flag** (`--model`, `--effort`) — applies to ALL phases globally
2. **Config file** (`.claude-swarm.json` `models` field) — per-phase configuration
3. **Defaults** (in `model-router.ts`) — built-in phase defaults

**Example override scenarios:**

```bash
# Use CLI flag to save costs across entire project
claude-swarm watch --auto --model sonnet --effort low

# Or keep per-phase routing from config, just reduce effort
claude-swarm watch --auto --effort low

# In config, tune phases individually
# (plan = opus+high, cook = sonnet+medium, test = sonnet+low, etc.)
```

**Phase names in `.models` config:**
- `plan` — planning phase (default: opus, high)
- `cook` — implementation phase (default: sonnet, medium)
- `fix` — bug fix phase (default: sonnet, medium)
- `test` — testing phase (default: sonnet, low)
- `security` — security scan (default: sonnet, medium)
- `red-team` — adversarial review (default: opus, high)

---

## Commands

| Command | Description |
|---------|-------------|
| `watch` | Watch GitHub issues and dispatch to execution flows |
| `read` | Extract tasks from Slack channel |
| `brainstorm` | Brainstorm solutions and optionally create GitHub issues |
| `report` | Send Slack report for a GitHub issue |
| `status` | Operator dashboard: tasks, history, cost, capabilities |
| `build` | Generate roadmaps, create issues, and execute implementation pipelines |
| `sync` | Smart vault sync — promote, inject, and check knowledge alignment |

---

## watch

Poll GitHub issues by label, classify, and dispatch to the correct execution flow.

```bash
claude-swarm watch [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <owner/repo>` | GitHub repository — auto-detected from git remote or `.claude-swarm.json` | — |
| `--interval <ms>` | Poll interval in milliseconds (daemon mode) | `60000` |
| `--max-per-hour <n>` | Rate limit — max issues processed per hour | `10` |
| `--auto` | Enable `--dangerously-skip-permissions` (unattended) | `false` |
| `--vault <path>` | Obsidian vault path (enables post-ship: journal, verify, e2e) | — |
| `--base-url <url>` | Base URL for E2E browser tests | — |
| `--red-team` | Enable adversarial red-team verification pass | `false` |
| `--use-team` | Use `/ck:team` for parallel agent execution | `false` |
| `--dry-run` | Fetch and classify issues without executing flows | `false` |
| `--model <model>` | Override model for all phases: `opus`, `sonnet`, `haiku` | (per-phase config) |
| `--effort <level>` | Override effort for all phases: `low`, `medium`, `high`, `max` | (per-phase config) |

### How It Works

```
Poll (every --interval ms)
  │
  ├── Fetch open issues with "ready_for_dev" label
  │
  ├── For each issue:
  │   ├── Classify: title prefix [BUG] → debug-flow, else → ship-flow
  │   ├── Route flags: "frontend" → design review, "hard" → opus, "security" → scan
  │   ├── Clarify: check spec clarity, post questions if ambiguous
  │   │
  │   ├── [BUG] → Debug Flow
  │   │   └── /ck:debug → /ck:fix → /ck:test (retry up to 3 cycles)
  │   │
  │   ├── [FEATURE/DOCS/CHORE] → Ship Flow
  │   │   └── /plan:fast → /ck:cook --auto → commit → PR
  │   │
  │   └── Post-ship (when --vault provided):
  │       ├── Verify (+ red-team if --red-team)
  │       ├── Security scan (if "security" label)
  │       ├── E2E browser tests (if --base-url)
  │       ├── Design review (if "frontend" label)
  │       ├── Slack report
  │       ├── Obsidian journal + lessons
  │       └── llms.txt generation
  │
  └── Rate limit: skip remaining if --max-per-hour reached
```

### Issue Classification

Issues are classified by title prefix (highest priority) or GitHub label (fallback):

| Title Prefix | Type | Flow | Notes |
|-------------|------|------|-------|
| `[BUG]` | bug | debug-flow | 3-cycle retry loop |
| `[FEATURE]` | feature | ship-flow | Full plan + cook |
| `[DOCS]` | docs | ship-flow | `--no-test` auto-added |
| `[CHORE]` | chore | ship-flow | `--no-test` auto-added |
| (none) | unknown | ship-flow | Falls back to label detection |

### Label Routing

| Label | Effect |
|-------|--------|
| `frontend` / `ui` | Triggers design review post-ship |
| `hard` | Forces opus model override |
| `security` | Triggers OWASP security scan post-ship |
| `ready_for_dev` | Trigger label for watch daemon |

### E2E Scenarios

The E2E runner parses scenarios from the issue body. Include a section like:

```markdown
## E2E Scenarios
- Login with valid credentials and verify dashboard
- Add item to cart and complete checkout
- Verify order confirmation email sent
```

These are automatically extracted and passed to the `agent-browser` E2E test runner.

### Safety Features

- **Budget guard**: Max 20 invocations / 500K tokens per issue (configurable)
- **Cost tracking**: Per-issue cost estimates logged to `.ck-costs.json`
- **Comment guard**: Skips duplicate bot comments
- **Comment sanitizer**: Strips sensitive data from GitHub comments
- **Conversation history**: Persists phase outputs across restarts

### Examples

```bash
# Auto-detect repo from git remote — just run from project root
claude-swarm watch --auto

# Or specify repo explicitly
claude-swarm watch --repo myorg/myapp --auto

# Cost-saving mode: override all phases to sonnet + low effort
claude-swarm watch --auto --model sonnet --effort low

# Override just effort (keep per-phase model routing from config)
claude-swarm watch --auto --effort low

# Full pipeline with vault + E2E
claude-swarm watch --auto \
  --vault ../second-brain \
  --base-url http://localhost:3000 \
  --red-team

# Dry run — see what would be processed
claude-swarm watch --dry-run

# Slower poll, lower rate limit
claude-swarm watch --auto --interval 120000 --max-per-hour 5
```

---

## read

Extract actionable tasks from a Slack channel using Claude.

```bash
claude-swarm read <channel> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `<channel>` | **Required.** Slack channel name or ID | — |
| `-s, --since <duration>` | Time window (e.g. `24h`, `7d`) | `24h` |
| `-o, --output <format>` | Output: `text`, `json`, or `issues` | `text` |
| `-r, --repo <owner/repo>` | Create GitHub issues (requires `--output issues`) | — |
| `-m, --model <model>` | Model override: `opus`, `sonnet`, `haiku` | — |

### Examples

```bash
# Read last 24h from #medusa
claude-swarm read "#medusa"

# Read last 7 days, output as JSON
claude-swarm read "#medusa" --since 7d --output json

# Read and auto-create GitHub issues
claude-swarm read "#medusa" --output issues --repo myorg/myapp
```

---

## brainstorm

Analyze a topic with trade-off analysis, generate solutions, and optionally create a GitHub issue.

```bash
claude-swarm brainstorm <topic> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `<topic>` | **Required.** Topic or question to brainstorm | — |
| `-c, --context <file>` | Context file for additional background | — |
| `-r, --repo <owner/repo>` | Create GitHub issue from result | — |
| `-l, --label <labels>` | Issue labels, comma-separated | `brainstorm` |
| `-m, --model <model>` | Model override: `opus`, `sonnet`, `haiku` | — |

### Output Structure

Generated output includes these sections:
- **Problem** — brief statement
- **Solutions** — 3-5 approaches with pros/cons
- **Trade-offs** — comparison summary
- **Recommendation** — single best solution
- **E2E Scenarios** — testable user-facing scenarios (auto-parsed by watch E2E runner)

### Examples

```bash
# Brainstorm locally
claude-swarm brainstorm "payment webhook retry strategy"

# Brainstorm and create GitHub issue
claude-swarm brainstorm "add OAuth2 to API" --repo myorg/myapp

# With context file and custom labels
claude-swarm brainstorm "migrate to PostgreSQL" \
  --context docs/db-notes.md \
  --repo myorg/myapp \
  --label "feature,database"
```

---

## report

Send a Slack report summarizing a GitHub issue's status.

```bash
claude-swarm report [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --repo <owner/repo>` | **Required.** Repository | — |
| `-i, --issue <number>` | **Required.** Issue number | — |
| `-c, --channel <channel>` | Slack channel override | — |
| `-m, --model <model>` | Model override: `opus`, `sonnet`, `haiku` | — |

### Examples

```bash
claude-swarm report --repo myorg/myapp --issue 42
claude-swarm report --repo myorg/myapp --issue 42 --channel "#releases"
```

---

## build

Generate roadmaps, create GitHub issues, and execute implementation pipelines from human-written requirements.

```bash
claude-swarm build <subcommand> [options]
```

### Subcommands

| Subcommand | Description |
|------------|-------------|
| `generate` | Generate a structured roadmap from a topic or @file |
| `from-scratch` | One-liner: generate roadmap → create issues → execute epics |
| `init` | (Phase 1 — not yet implemented) Parse roadmap and create GitHub issues |
| `plan` | Plan issues in an epic with `/ck:plan` |
| `cook` | Implement issues in an epic with `/ck:cook --auto` |
| `run` | Execute epics per roadmap phases (plan→cook→test→commit) |
| `status` | Show build progress across milestone/epic/issue hierarchy |

### generate

Create a structured implementation roadmap from a topic.

```bash
claude-swarm build generate <input> [options]
```

**Options**

| Flag | Description | Default |
|------|-------------|---------|
| `<input>` | **Required.** Topic string or `@filepath` for file input | — |
| `--context <file>` | Additional context file (`@path`) for background | — |
| `--epics <n>` | Hint: number of epics to organize into | auto |
| `--output-dir <dir>` | Output directory for roadmap markdown | `docs` |
| `--dry-run` | Print roadmap to stdout without saving | `false` |

**Examples**

```bash
# Generate roadmap from topic string
claude-swarm build generate "Add payment gateway integration"

# Generate from file input
claude-swarm build generate "@docs/feature-request.md"

# With context and epic count hint
claude-swarm build generate "OAuth2 authentication" \
  --context @docs/security-standards.md \
  --epics 4

# Dry run — see output before saving
claude-swarm build generate "Database migration" --dry-run
```

### from-scratch

One-liner pipeline: generates roadmap, creates GitHub issues, and executes implementation epics.

```bash
claude-swarm build from-scratch <input> [options]
```

**Options**

| Flag | Description | Default |
|------|-------------|---------|
| `<input>` | **Required.** Topic string or `@filepath` for file input | — |
| `--context <file>` | Additional context file (`@path`) for background | — |
| `--epics <n>` | Hint: number of epics to organize into | auto |
| `--auto` | Enable auto mode for all steps (unattended execution) | `false` |
| `--budget <n>` | Max USD budget per step (future use) | — |
| `--dry-run` | Generate roadmap only, skip init and run | `false` |

**Examples**

```bash
# Generate and preview (dry run)
claude-swarm build from-scratch "Add Stripe payments" --dry-run

# Full auto pipeline with budget limit
claude-swarm build from-scratch "Implement user profiles" \
  --auto \
  --budget 50 \
  --context @docs/db-schema.md

# Manual multi-step (recommended for large features)
claude-swarm build from-scratch "Admin dashboard" --dry-run
# Review roadmap at docs/implement-roadmap-admin-dashboard.md
# Then run: claude-swarm build init @docs/implement-roadmap-admin-dashboard.md
```

### run

Execute plan→cook→test→ship pipeline for epics.

```bash
claude-swarm build run --epic <n> [options]
```

**Options**

| Flag | Description | Default |
|------|-------------|---------|
| `--epic <n>` | **Required.** Run specific epic by issue number | — |
| `--all` | Run all open epics (label: epic) | `false` |
| `--from <n>` | Resume from epic number N (with --all) | — |
| `--from-issue <n>` | Skip child issues < N within an epic | — |
| `--hard` | Deep analysis: plan red-team + predict per issue | `false` |
| `--auto` | Enable auto mode for all claude calls | `false` |
| `--budget <n>` | Max USD per claude call | — |
| `--permission-mode <mode>` | Permission mode: `auto` or `skip` | — |
| `--timeout <s>` | Timeout per step in seconds | `600` |
| `--dry-run` | Show what would run without executing | `false` |
| `--model <model>` | Override model for all steps: `opus`, `sonnet`, `haiku` | (per-phase config) |
| `--effort <level>` | Override effort for all steps: `low`, `medium`, `high`, `max` | (per-phase config) |

**Examples**

```bash
# Run single epic with cost-saving model
claude-swarm build run --epic 42 --auto --model sonnet --effort low

# Run all epics from a specific point
claude-swarm build run --all --from 5 --auto

# Deep analysis mode
claude-swarm build run --epic 42 --hard --model opus --effort high --auto
```

### plan

Run `/ck:plan` for each open issue in an epic.

```bash
claude-swarm build plan --epic <n> [options]
```

**Options**

| Flag | Description | Default |
|------|-------------|---------|
| `--epic <n>` | **Required.** Epic issue number | — |
| `--budget <n>` | Max USD per claude call | — |
| `--permission-mode <mode>` | Permission mode: `auto` or `skip` | — |
| `--timeout <s>` | Timeout per call in seconds | — |
| `--dry-run` | Show what would run | `false` |
| `--model <model>` | Override model: `opus`, `sonnet`, `haiku` | (config) |
| `--effort <level>` | Override effort: `low`, `medium`, `high`, `max` | (config) |

### cook

Run `/ck:cook` for each open issue in an epic.

```bash
claude-swarm build cook --epic <n> [options]
```

**Options**

| Flag | Description | Default |
|------|-------------|---------|
| `--epic <n>` | **Required.** Epic issue number | — |
| `--auto` | Enable auto mode | `false` |
| `--budget <n>` | Max USD per claude call | — |
| `--permission-mode <mode>` | Permission mode: `auto` or `skip` | — |
| `--timeout <s>` | Timeout per call in seconds | — |
| `--dry-run` | Show what would run | `false` |
| `--model <model>` | Override model: `opus`, `sonnet`, `haiku` | (config) |
| `--effort <level>` | Override effort: `low`, `medium`, `high`, `max` | (config) |

### status

Show build progress across milestone → epic → issue hierarchy.

```bash
claude-swarm build status [options]
```

**Options**

| Flag | Description |
|------|-------------|
| `--milestone <name>` | Filter by milestone name (default: most recent open) |

**Output**

Terminal dashboard with:
- Milestone header with overall progress bar (closed/total issues)
- Per-epic progress bars (closed/total children)
- Cost summary from `.ck-costs.json` (silently skipped if absent)

**Example**

```
╔══════════════════════════════════════════════════╗
║  Milestone: v2.1 — Add Payment Gateway          ║
║  ████████████░░░░░░░░ 12/20 (60%)               ║
╚══════════════════════════════════════════════════╝

  Epic #1: Database Schema
    ██████████████████░░ 9/10 (90%)

  Epic #2: API Endpoints
    ████████░░░░░░░░░░░░ 2/5 (40%)

💰 Cost (today): $2.45 across 8 runs
   Top: #42 ($0.89), #43 ($0.67)
```

```bash
# Show most recent open milestone
claude-swarm build status

# Filter by specific milestone
claude-swarm build status --milestone "v2.1"
```

---

## status

Operator dashboard showing active tasks, run history, costs, and capabilities.

```bash
claude-swarm status [options]
```

### Options

| Flag | Description |
|------|-------------|
| (none) | Full dashboard: active tasks, queue, recent, cost |
| `--active` | Show only active/in-progress tasks |
| `--recent <n>` | Last N completed tasks (default: 10) |
| `--cost` | Today's cost summary |
| `--task <id>` | Detailed view of a single task |
| `--history` | Full run history (newest first, max 25) |
| `--issue <num>` | Filter history by issue number |
| `--date <YYYY-MM-DD>` | Filter history by date |
| `--resume` | List resumable failed/timed-out tasks |
| `--matrix` | Show capability matrix (phases, models, tools) |
| `--search <query>` | Search plans, runs, and reviews |

### Examples

```bash
# Full dashboard
claude-swarm status

# Active tasks only
claude-swarm status --active

# Cost summary
claude-swarm status --cost

# History for a specific issue
claude-swarm status --history --issue 42

# Search across everything
claude-swarm status --search "payment webhook"

# View specific task details
claude-swarm status --task "run-42-1712345678"

# Capability matrix
claude-swarm status --matrix
```

---

## sync

Smart vault sync with three subcommands: promote notes from project vault to second-brain (`pull`), inject global knowledge into project (`push`), and verify alignment between vaults (`check`).

```bash
claude-swarm sync <subcommand> [options]
```

### Global Options

| Flag | Description | Default |
|------|-------------|---------|
| `--project <name>` | Project name (default: cwd basename) | — |
| `--vault <path>` | Project vault path | `./obsidian-vault` |
| `--brain <path>` | Second-brain path | `../second-brain` |
| `--dry-run` | Preview changes without writing | `false` |

### pull

Promote project vault notes to second-brain using Claude classification.

```bash
claude-swarm sync pull [options]
```

**Description:** Analyzes project vault for insights worthy of global knowledge base. Filters by relevance and prevents duplicates before promoting to second-brain.

**Example**

```bash
# Preview promotions (dry run)
claude-swarm sync pull --dry-run

# Promote with custom paths
claude-swarm sync pull --vault ./notes --brain ../second-brain
```

### push

Inject second-brain knowledge into project vault with cycle detection.

```bash
claude-swarm sync push [options]
```

**Description:** Distributes relevant global knowledge to project vault. Detects and prevents circular dependencies between vaults.

**Example**

```bash
# Preview injections (dry run)
claude-swarm sync push --dry-run

# Push with custom brain path
claude-swarm sync push --brain ../second-brain
```

### check

Check alignment and detect anomalies between project vault and second-brain.

```bash
claude-swarm sync check [options]
```

**Description:** Validates knowledge consistency, detects missing references, orphaned notes, and cross-vault anomalies.

**Example**

```bash
# Run alignment check
claude-swarm sync check

# Check with custom paths
claude-swarm sync check --vault ./notes --brain ../second-brain
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | For `brainstorm --repo`, `read --output issues`, `report` | GitHub API token |
| `gh` CLI | For `watch` | Must be authenticated (`gh auth login`) |

---

## 14-State Issue Lifecycle

```
new → brainstorming → clarifying → planning → plan_posted
  → awaiting_approval → implementing → testing
  → verifying → e2e_testing → reporting → journaling
  → completed
  → error | timeout | needs_refix (failure states)
```
