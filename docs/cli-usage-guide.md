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
  "baseUrl": "http://localhost:3000",
  "interval": 60000,
  "maxPerHour": 10,
  "redTeam": true
}
```

**Resolution priority:** CLI flag > `.claude-swarm.json` > git remote auto-detect.

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
| `run` | (Phase 3 — not yet implemented) Execute epics per roadmap phases |
| `status` | (Phase 4 — not yet implemented) Show build pipeline status |

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
