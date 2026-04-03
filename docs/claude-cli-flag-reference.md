# Claude CLI Flag Reference for Cost-Optimized Automation

---

## Cost Control Flags

| Flag | Syntax | What It Does |
|---|---|---|
| `--max-budget-usd` | `--max-budget-usd 3.00` | Hard stop when spending reaches USD amount |
| `--max-turns` | `--max-turns 5` | Limit agentic loop iterations |
| `--model` | `--model haiku\|sonnet\|opus` | Model tier selection (global across all phases) |
| `--effort` | `--effort low\|medium\|high\|max` | Reasoning depth (low=cheapest; applies to all phases) |
| `--bare` | `--bare` | Skip hooks, MCP, skills, CLAUDE.md (faster startup, fewer tokens) |
| `--fallback-model` | `--fallback-model sonnet` | Auto-fallback when primary overloaded |

### Model Cost Tiers

```
haiku   → cheapest  (summaries, formatting, reports)
sonnet  → balanced  (coding, testing, execution)
opus    → expensive (reasoning, architecture, debugging)
```

### Effort Levels

```
low    → ~10% token reduction, fastest
medium → baseline (default)
high   → ~30-50% token increase, deeper reasoning
max    → highest cost, no limit (opus only)
```

---

## claude-swarm Model & Effort Routing

The `claude-swarm watch`, `build run`, `build plan`, and `build cook` commands support model and effort overrides:

| Flag | What It Does | Example | Default |
|---|---|---|---|
| `--model <model>` | Override model for all phases/steps | `--model sonnet` | Per-phase config |
| `--effort <level>` | Override effort for all phases/steps | `--effort low` | Per-phase config |

**Override priority:** CLI flag > `.claude-swarm.json` models field > built-in defaults.

**Supported values:**
- Models: `opus`, `sonnet`, `haiku`
- Efforts: `low`, `medium`, `high`, `max`

**Examples:**

```bash
# Global cost optimization: all phases use sonnet + low effort
claude-swarm watch --auto --model sonnet --effort low
claude-swarm build run --epic 42 --auto --model sonnet --effort low

# Override just effort (keep per-phase model routing from config)
claude-swarm watch --auto --effort low

# Deep analysis mode: use opus + max effort
claude-swarm build plan --epic 42 --model opus --effort max
```

### Per-Phase Configuration (`.claude-swarm.json`)

Configure model/effort per phase in `.claude-swarm.json`:

```json
{
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

CLI `--model` and `--effort` flags override these per-phase settings globally.

---

## Permission Modes (Replace --dangerously-skip-permissions)

| Mode | What Claude Can Do Without Asking | Best For |
|---|---|---|
| `default` | Read files only | Sensitive work |
| `acceptEdits` | Read + edit files | Semi-auto coding |
| `plan` | Read-only, proposes changes | Planning phase |
| `auto` | All actions (classifier safety checks) | Overnight automation |
| `dontAsk` | Only pre-approved tools via allowedTools | Locked-down CI/CD |
| `bypassPermissions` | Everything, no checks | **Avoid** — last resort |

```bash
# BEFORE (dangerous)
claude -p "fix bug" --dangerously-skip-permissions

# AFTER (safe)
claude -p "fix bug" --permission-mode auto --allowedTools "Read,Grep,Glob,Bash,Write,Edit"
```

---

## Tool Gating

| Flag | What It Does |
|---|---|
| `--tools "Read,Edit,Bash"` | Restrict which tools are available (reduces context) |
| `--allowedTools "Bash(npm test),Read"` | Pre-approve specific commands (no prompts) |
| `--disallowedTools "Bash"` | Remove tools entirely |

### Pattern Syntax

```bash
"Bash(npm test)"       # exact match
"Bash(npm *)"          # prefix match (space before *)
"Bash(git diff *)"     # matches: git diff, git diff HEAD, etc.
```

### Tool Gating Per Phase

```bash
# Debug (read-only)
--permission-mode plan --allowedTools "Read,Grep,Glob,Bash"

# Fix (code access)
--permission-mode auto --allowedTools "Read,Grep,Glob,Bash,Write,Edit"

# Verify (read-only)
--permission-mode plan --allowedTools "Read,Grep,Glob"

# Report (minimal)
--permission-mode auto --allowedTools "Bash"
```

---

## Session Management

| Flag | What It Does |
|---|---|
| `--continue` / `-c` | Resume most recent session in current dir |
| `--resume "name"` / `-r` | Resume by session name or ID |
| `--name "fix-42"` / `-n` | Name the session for later resume |
| `--fork-session` | Branch from existing session (new ID) |
| `--session-id "uuid"` | Use specific session UUID |
| `--no-session-persistence` | Ephemeral — don't save to disk |

### Session Chaining (Share Context Across Phases)

```bash
# Phase 1: Debug (start named session)
claude -p "/debug issue #42" --name "issue-42" --model opus --output-format json

# Phase 2: Fix (continue same session — has debug context)
claude -p "/fix based on debug analysis" --continue --model sonnet

# Phase 3: Test (continue — has fix context)
claude -p "/test verify the fix" --continue --model sonnet
```

### Capture Session ID for Scripting

```bash
session_id=$(claude -p "analyze" --output-format json | jq -r '.session_id')
claude -p "continue" --resume "$session_id" --output-format json
```

---

## Output Control

| Flag | Format | Use Case |
|---|---|---|
| `--output-format text` | Plain text (default) | Human reading, log files |
| `--output-format json` | Structured JSON | Script parsing with jq |
| `--output-format stream-json` | Real-time events | Streaming monitoring |
| `--json-schema '{...}'` | Validated structured output | Data extraction |

### JSON Output (Parse with jq)

```bash
claude -p "query" --output-format json | jq '.result'
claude -p "query" --output-format json | jq '.usage.total_tokens'
```

---

## System Prompt Customization

| Flag | Behavior |
|---|---|
| `--append-system-prompt "..."` | Add to default prompt (recommended) |
| `--append-system-prompt-file ./rules.txt` | Add from file |
| `--system-prompt "..."` | Replace entire prompt (loses defaults) |
| `--system-prompt-file ./prompt.txt` | Replace from file |

```bash
# Recommended: append, keep Claude Code defaults
claude -p "review" --append-system-prompt "Focus on OWASP Top 10 security issues."
```

---

## --bare Mode (Speed + Cost)

Skips: hooks, skills, plugins, MCP, auto-memory, CLAUDE.md, OAuth/keychain.

```bash
# Fast, reproducible subprocess
claude --bare -p "analyze" \
  --model haiku \
  --effort low \
  --tools "Read,Bash" \
  --output-format json \
  --max-turns 3
```

**Startup**: ~30-50% faster. **Tokens**: ~5-15% fewer.

To load config explicitly in bare mode:
```bash
claude --bare -p "query" \
  --append-system-prompt-file ./rules.txt \
  --mcp-config ./mcp.json \
  --settings ./settings.json
```

---

## Environment Variables

| Variable | What It Does |
|---|---|
| `ANTHROPIC_MODEL` | Default model |
| `CLAUDE_CODE_EFFORT_LEVEL` | Default effort (low/medium/high/max) |
| `CLAUDE_CODE_SIMPLE=1` | Enable bare mode |
| `MAX_THINKING_TOKENS` | Limit extended thinking tokens |

---

## Optimal Patterns for Agent Swarm

### Cheapest Possible (Haiku + Bare + Low)

```bash
claude --bare -p "summarize logs" \
  --model haiku --effort low \
  --tools "Read" \
  --max-turns 2 --max-budget-usd 0.50 \
  --output-format json
```

### Safe Automation (Auto + Tool Gating)

```bash
claude -p "fix failing tests" \
  --permission-mode auto \
  --allowedTools "Bash(npm test),Bash(npm run *),Read,Edit" \
  --max-budget-usd 3.00 --max-turns 5 \
  --output-format text
```

### Read-Only Exploration (Plan Mode)

```bash
claude -p "analyze architecture" \
  --permission-mode plan \
  --model opus --effort high \
  --tools "Read,Grep,Glob" \
  --max-turns 5
```

---

## Cost Ranking (Cheapest → Most Expensive)

```
1. haiku  + low effort  + bare  ← $0.05-0.20
2. haiku  + medium      + bare
3. sonnet + low effort  + bare  ← $0.20-0.50
4. sonnet + medium             ← $0.20-1.00 (default)
5. sonnet + high effort
6. opus   + medium             ← $0.50-3.00
7. opus   + high effort
8. opus   + max effort         ← most expensive
```

**Save money by**:
- `--bare` for subprocesses: -5% tokens
- `haiku` instead of `sonnet`: -60-70% cost
- `--effort low` instead of `high`: -30-50% cost
- `--tools "Read,Edit"` (restrict tools): -10-20% tokens
- `--max-turns N`: prevents runaway loops
