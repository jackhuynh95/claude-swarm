# Enhancement Priorities

Actionable improvements from GPT-5.4 research, ordered by impact.
Focus: controlling workers, managing state, verifying outcomes, recovering runs, bounding costs.

---

## 1. Permission Handling (Highest Priority)

> Full CLI flag reference: [claude-cli-flag-reference.md](./claude-cli-flag-reference.md)

**Problem**: `--dangerously-skip-permissions` is brute-force. Unsafe for unattended runs.

**Fix**: Use `--permission-mode` levels + `--allowedTools` for defense-in-depth.

| Mode | When | Safety |
|---|---|---|
| `--permission-mode plan` | Planning, debug analysis | Read-only, no code changes |
| `--permission-mode acceptEdits` | Semi-auto coding | Approve edits only |
| `--permission-mode auto` | Overnight runs, trusted repos | Classifier safety checks |
| `--permission-mode dontAsk` | CI/CD, pre-defined safe commands | Only pre-approved tools |
| `--dangerously-skip-permissions` | **Avoid** — last resort only | No safety at all |

**Per-phase permission + tool gating:**

```bash
# Debug phase: read-only tools + plan mode
claude -p "/debug ..." \
  --permission-mode plan \
  --allowedTools "Read,Grep,Glob,Bash" \
  --model opus --effort high --max-budget-usd 2.00

# Fix phase: code tools + auto mode
claude -p "/fix ..." \
  --permission-mode auto \
  --allowedTools "Read,Grep,Glob,Bash(npm *),Write,Edit" \
  --model sonnet --effort medium --max-budget-usd 3.00

# Test phase: run tests only
claude -p "/test ..." \
  --permission-mode auto \
  --allowedTools "Bash(npm test),Bash(npm run test:*),Read,Grep,Glob" \
  --model sonnet --effort low --max-budget-usd 1.00

# Verify phase: read-only
claude -p "Verify fix..." \
  --permission-mode plan \
  --allowedTools "Read,Grep,Glob" \
  --model sonnet --effort medium --max-budget-usd 1.00

# Report phase: minimal
claude -p "/slack-report ..." \
  --permission-mode auto \
  --allowedTools "Bash" \
  --model haiku --effort low --max-budget-usd 0.50
```

**Migration table** (auto-claude scripts → claude-swarm):

| Script | Current | Should Be |
|---|---|---|
| fix-issue.sh (debug) | `--dangerously-skip-permissions` | `--permission-mode plan --allowedTools Read,Grep,Glob,Bash` |
| fix-issue.sh (fix) | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Read,Grep,Glob,Bash,Write,Edit` |
| fix-issue.sh (test) | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Bash(npm test),Read,Grep,Glob` |
| ship-issue.sh (plan) | `--dangerously-skip-permissions` | `--permission-mode plan --allowedTools Read,Grep,Glob,Bash` |
| ship-issue.sh (code) | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Read,Grep,Glob,Bash,Write,Edit` |
| verify-issue.sh | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Read,Grep,Glob,Bash` |
| report-issue.sh | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Bash` |
| brainstorm-issue.sh | `--dangerously-skip-permissions` | `--permission-mode auto --allowedTools Read,Grep,Glob,Bash` |

---

## 2. Verification as Formal Phase

**Problem**: Claude finishing does not mean success. False completion claims in overnight runs.

**Fix**: Add independent verifier after implementation.

```
implement → verify → report
              │
              ├── Read-only agent
              ├── Tries to falsify success
              ├── Collects evidence (test output, diff review)
              ├── Verdict: PASS / FAIL / PARTIAL
              └── Blocks reporting on FAIL
```

**Evidence schema** (file-based, debuggable):

```json
{
  "issueNumber": 42,
  "verdict": "PASS",
  "evidence": [
    { "type": "test_output", "result": "24/24 passed", "path": "logs/test-042.log" },
    { "type": "diff_review", "result": "no security issues", "path": "logs/review-042.log" }
  ],
  "timestamp": "2026-04-01T23:15:00Z"
}
```

---

## 3. Budget Guards

> See also: [claude-cli-flag-reference.md](./claude-cli-flag-reference.md) § Cost Control Flags

**Problem**: Unattended runs can burn money silently. Retry loops are unbounded.

**Fix**: `--max-budget-usd` + `--max-turns` + `--effort low` where possible.

```bash
# Per-phase budget (hard cap, CLI enforces)
claude -p "/fix ..." --max-budget-usd 3.00 --max-turns 5

# Cheap tasks: haiku + low effort + bare mode
claude --bare -p "/slack-report ..." --model haiku --effort low --max-budget-usd 0.50

# Build script uses --budget flag
./build-phases.sh --auto --budget 5.00
```

**Stop conditions**:
- Per-worker: `--max-budget-usd` (hard cap, Claude CLI enforces)
- Per-worker: `--max-turns N` (prevents infinite loops)
- Per-issue: max 3 retry cycles (already in fix-issue.sh)
- Per-run: max 10 issues per looper cycle
- Nightly: max $50 total (configurable)
- Consecutive failures: stop after 2 in a row

**Cost ranking** (cheapest → expensive):
1. haiku + low effort + `--bare` = ~$0.05-0.20
2. sonnet + medium = ~$0.20-1.00
3. opus + high = ~$0.50-3.00

---

## 4. Resume / History / Recovery

**Problem**: Long-running workflows break if context recovery is weak.

**Fix**: Use Claude CLI's built-in session management.

```bash
# Name sessions for easy resume
claude -p "/fix issue #42" --name "fix-42"

# Resume by name
claude --resume "fix-42"

# Continue most recent in current dir
claude --continue

# Fork a session (new branch from existing context)
claude --resume "fix-42" --fork-session
```

**Run index**: Store session metadata per issue in `.ck.json`:

```json
{
  "issues": {
    "42": {
      "sessionName": "fix-42",
      "lastPhase": "testing",
      "lastCheckpoint": "2026-04-01T22:00:00Z",
      "retryCount": 1,
      "budgetUsed": 1.50
    }
  }
}
```

---

## 5. Wrapper Quality Around Claude CLI

**Problem**: Prompts are passed as raw strings. No structure, no consistency.

**Fix**: Standardize prompt templates per phase.

```typescript
// Standard prompt structure
function buildPrompt(phase: string, context: {
  issueNum: number;
  issueTitle: string;
  issueBody: string;
  debugAnalysis?: string;
  planPath?: string;
}): string {
  const header = `GitHub Issue #${context.issueNum}: ${context.issueTitle}\n\n${context.issueBody}`;

  switch (phase) {
    case "debug":
      return `/debug Investigate root cause. Do NOT fix.\n\n${header}`;
    case "fix":
      return `/fix Fix based on debug analysis:\n\n${header}\n\n--- Debug Analysis ---\n${context.debugAnalysis}`;
    case "plan":
      return `/plan:fast Implement this issue:\n\n${header}`;
    case "cook":
      return `/ck:cook --auto ${context.planPath}`;
    case "verify":
      return `Verify fix for issue #${context.issueNum}. Check tests pass, no regressions, no security issues. Report PASS/FAIL with evidence.`;
    case "report":
      return `/slack-report Issue #${context.issueNum} ${context.issueTitle} — shipped`;
  }
}
```

---

## 6. Conversation History Across Phases

**Problem**: Context lost between debug → fix → test phases.

**Fix**: Use `--continue` to chain phases in same session.

```bash
# Phase 1: Debug (starts new session)
claude -p "/debug ..." --name "issue-42" --model opus

# Phase 2: Fix (continues same session)
claude -p "/fix ..." --continue --model sonnet

# Phase 3: Test (continues same session)
claude -p "/test ..." --continue --model sonnet
```

All three phases share context — debug analysis feeds into fix, fix context feeds into test.

---

## 7. Sensitive Data Filter

**Problem**: Claude might post secrets in GitHub issue comments.

**Fix**: Scan output before posting.

```typescript
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*\S+/gi,
  /(?:sk-|pk_|rk_)[a-zA-Z0-9]{20,}/g,           // API keys
  /(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36}/g, // GitHub tokens
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,     // Private keys
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,                   // AWS keys
];

function stripSecrets(text: string): string {
  let clean = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED]");
  }
  return clean;
}
```

---

## 8. Capability Matrix (Living Doc)

Track what actually works vs what's planned.

| Capability | Status | Confidence | Phase |
|---|---|---|---|
| Daemon loop | Kept from CK | High | 1 |
| State persistence | Kept from CK | High | 1 |
| Issue routing | To build | — | 2 |
| Debug flow | To build | — | 3 |
| Ship flow | To build | — | 3 |
| Verifier | To build | — | 4 |
| E2E testing | To build | — | 4 |
| Slack ops | To build | — | 4+5 |
| Permission modes | **Ready** (CLI supports it) | High | 0 |
| Budget guards | **Ready** (--max-budget-usd) | High | 0 |
| Session resume | **Ready** (--resume, --continue) | High | 0 |
| Tool gating | **Ready** (--allowedTools) | High | 0 |
| Obsidian vault | To build | — | 7 |

**Key insight**: Items marked "Ready" are free — Claude CLI already supports them. Just need to wire them in.

---

## Scope Agreement (Team, 2026-04-01)

**What claude-swarm builds** (our unique stuff):
- Obsidian vault integration + /obsidian-journal
- CK watch daemon + issue routing + execution flows
- E2E testing, Slack ops, design review

**What we just USE from Claude CLI** (free flags, don't rebuild):
- `--permission-mode auto` (safer permissions)
- `--max-budget-usd` / `--max-turns` (budget control)
- `--continue` / `--resume` / `--name` (session management)
- `--allowedTools` (tool gating)
- `--bare` (fast subprocess mode)
- `--effort low` (token savings)
- `--output-format json` (structured parsing)

**What we leave to Anthropic/community**:
- CLI wrapper improvements (they'll enhance these themselves)
- Permission system evolution
- Session/history/resume improvements
- Budget control features
- Verification frameworks

> Full reference: [claude-cli-flag-reference.md](./claude-cli-flag-reference.md)

## Priority Order

```
OUR BUILD (unique value):
1. Obsidian vault + /obsidian-journal               ← Phase 7
2. Issue routing (BUG/FEATURE/DOCS)                 ← Phase 2
3. Debug → Fix → Test loop                          ← Phase 3
4. E2E browser testing                              ← Phase 4
5. Slack read + report                              ← Phase 4+5
6. Verification agent (PASS/FAIL)                   ← Phase 4
7. Sensitive data filter                            ← Phase 6

JUST USE (free CLI flags, zero build cost):
- --permission-mode auto + --allowedTools            ← use now
- --max-budget-usd + --max-turns                     ← use now
- --continue / --resume / --name                     ← use now
- --bare for subprocesses                            ← use now
- --effort low for cheap tasks                       ← use now
- --output-format json for scripting                 ← use now
```

**Build what's unique to us. Use what Claude CLI already gives for free.**
