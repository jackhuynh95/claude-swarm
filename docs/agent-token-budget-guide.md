# Agent Token Budget Guide

Reference for spawning sub-agents with proper model routing and token controls.

---

## Model Routing by Role

| Agent Role | Model | Effort | Max Turns | Why |
|---|---|---|---|---|
| Brainstorm | opus | max | 10 | Deep creative thinking |
| Plan | opus | high | 8 | Architectural reasoning |
| Plan red-team | opus | high | 5 | Adversarial review |
| Debug (analyze) | opus | high | 5 | Root cause reasoning |
| Clarify (spec Q&A) | opus | medium | 5 | Ask right questions |
| Fix (code) | sonnet | medium | 5 | Code execution |
| Test | sonnet | low | 3 | Run and report |
| E2E | sonnet | low | 3 | Browser automation |
| Verify | sonnet | medium | 3 | Independent check |
| Security scan | sonnet | medium | 3 | OWASP audit |
| Slack read | opus | low | 2 | Extract, don't overthink |
| Slack report | haiku | low | 1 | Format and send |
| Journal write | haiku | low | 1 | Summarize to vault |
| Docs generation | sonnet | low | 2 | llms.txt, changelog |

**Rule of thumb**: Thinking = opus. Execution = sonnet. Formatting = haiku.

---

## Spawning Methods

### 1. Claude CLI Subprocess (Watcher / Shell Scripts)

```bash
# Thinking task (opus, high effort)
claude -p "/ck:plan --fast Issue #42: Add wishlist plugin" \
  --model opus \
  --effort high \
  --max-turns 8 \
  --output-format text

# Execution task (sonnet, medium effort)
claude -p "/ck:cook --auto @plans/latest/plan.md" \
  --model sonnet \
  --effort medium \
  --max-turns 5 \
  --output-format text

# Formatting task (haiku, low effort)
claude -p "/slack-report Issue #42 shipped, PR #55 created" \
  --model haiku \
  --effort low \
  --max-turns 1 \
  --output-format text
```

### 2. CK v2.14.0 Team Agents

```bash
# Parallel implementation (2 devs + 1 reviewer)
/ck:team implement "Add wishlist plugin" --devs 2 --reviewers 1

# Research team (2 researchers in parallel)
/ck:team research "Evaluate payment gateways" --researchers 2

# Red-team review (adversarial)
/ck:team review "PR #55" --reviewers 2

# Debug team (distributed root-cause analysis)
/ck:team debug "Checkout timeout issue" --devs 1 --researchers 1
```

### 3. Node.js Subprocess (TypeScript Phases)

```typescript
import { spawn } from "child_process";

function spawnClaude(opts: {
  prompt: string;
  model: "opus" | "sonnet" | "haiku";
  effort: "low" | "medium" | "high" | "max";
  maxTurns: number;
  cwd: string;
  tools?: string[];
  autoApprove?: boolean;
  timeoutMs?: number;
}) {
  const args = [
    "-p", opts.prompt,
    "--model", opts.model,
    "--effort", opts.effort,
    "--max-turns", String(opts.maxTurns),
    "--output-format", "text",
  ];

  if (opts.tools?.length) {
    args.push("--allowedTools", opts.tools.join(","));
  }

  if (opts.autoApprove) {
    args.push("--dangerously-skip-permissions");
  }

  const child = spawn("claude", args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
  });

  // Timeout enforcement (SIGTERM → 5s → SIGKILL)
  const timeout = opts.timeoutMs || 300000; // default 5min
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5000);
  }, timeout);

  child.on("exit", () => clearTimeout(timer));

  return child;
}
```

**Usage examples:**

```typescript
// Debug analysis (opus, read-only tools)
spawnClaude({
  prompt: "/debug Investigate issue #42: checkout timeout",
  model: "opus",
  effort: "high",
  maxTurns: 5,
  cwd: projectRoot,
  tools: ["Read", "Grep", "Glob", "Bash"],
});

// Fix implementation (sonnet, full tools)
spawnClaude({
  prompt: "/ck:cook --auto @plans/latest/plan.md",
  model: "sonnet",
  effort: "medium",
  maxTurns: 5,
  cwd: projectRoot,
  tools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit"],
  autoApprove: true,
});

// Slack report (haiku, minimal)
spawnClaude({
  prompt: "/slack-report Issue #42 shipped",
  model: "haiku",
  effort: "low",
  maxTurns: 1,
  cwd: projectRoot,
  tools: ["Bash"],
});
```

---

## Tool Gating by Phase

Restrict tool access per phase to reduce token waste and improve safety.

| Phase | Allowed Tools | Why |
|---|---|---|
| Brainstorm | Read, Grep, Glob | Read-only exploration |
| Plan | Read, Grep, Glob, Bash | Read + run analysis commands |
| Debug | Read, Grep, Glob, Bash | Read-only investigation |
| Fix / Cook | Read, Grep, Glob, Bash, Write, Edit | Full code access |
| Test | Read, Grep, Glob, Bash | Run tests, no code edits |
| E2E | Bash | Browser automation only |
| Verify | Read, Grep, Glob | Read-only verification |
| Slack read | Bash | CDP/API access only |
| Slack report | Bash | Send message only |
| Journal | Write | Write to vault only |
| Security scan | Read, Grep, Glob, Bash | Scan, no modify |

---

## Budget Controls

### Per-Worker Caps

```typescript
const BUDGET = {
  brainstorm:  { maxTokens: 50000, maxTurns: 10, timeoutMs: 600000 },
  plan:        { maxTokens: 40000, maxTurns: 8,  timeoutMs: 480000 },
  debug:       { maxTokens: 30000, maxTurns: 5,  timeoutMs: 300000 },
  fix:         { maxTokens: 40000, maxTurns: 5,  timeoutMs: 300000 },
  test:        { maxTokens: 15000, maxTurns: 3,  timeoutMs: 180000 },
  e2e:         { maxTokens: 15000, maxTurns: 3,  timeoutMs: 180000 },
  verify:      { maxTokens: 20000, maxTurns: 3,  timeoutMs: 180000 },
  slackRead:   { maxTokens: 10000, maxTurns: 2,  timeoutMs: 60000  },
  slackReport: { maxTokens: 5000,  maxTurns: 1,  timeoutMs: 30000  },
  journal:     { maxTokens: 5000,  maxTurns: 1,  timeoutMs: 30000  },
  security:    { maxTokens: 20000, maxTurns: 3,  timeoutMs: 180000 },
};
```

### Nightly Budget Ceiling

```typescript
const NIGHTLY_BUDGET = {
  maxIssuesPerRun: 10,
  maxTotalTokens: 500000,     // ~$15 ceiling
  maxRetryPerIssue: 3,
  stopOnConsecutiveFailures: 2,
};
```

### Continuation Guards

```typescript
// Stop conditions for retry loops
function shouldStop(state: WorkerState): boolean {
  return (
    state.retryCount >= BUDGET[state.role].maxTurns ||
    state.tokensUsed >= BUDGET[state.role].maxTokens ||
    state.consecutiveFailures >= 2
  );
}
```

---

## Token-Saving Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using opus for code execution | Use sonnet — opus thinks too much for typing code |
| No `--max-turns` | Always set — prevents runaway conversations |
| Full tool access for read-only phases | Gate tools — fewer tools = fewer token-heavy tool calls |
| Using opus for Slack reporting | Use haiku — it's just formatting |
| Retrying same prompt after failure | Add failure context, change approach, or stop |
| Spawning 5 parallel agents at once | Cap at 2-3 — diminishing returns + resource contention |
| No timeout on subprocess | Always set timeout — SIGTERM → 5s → SIGKILL |
