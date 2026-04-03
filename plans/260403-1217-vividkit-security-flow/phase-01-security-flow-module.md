---
phase: 1
title: Security Flow Module + Post-Ship Wiring
status: complete
priority: high
effort: medium
---

# Phase 1 — Security Flow Module + Post-Ship Wiring

## Context

- [Roadmap Phase 4](../../docs/implement-roadmap-vividkit-commands.md) — Red Testing
- [test-flow.ts](../../src/commands/watch/phases/test-flow.ts) — pattern reference (green testing)
- [post-ship-runner.ts](../../src/commands/watch/phases/post-ship-runner.ts) — integration target

## Overview

Create `security-flow.ts` following the exact pattern of `test-flow.ts`. The module implements the "red testing" pipeline: can the new code be hacked? Sequential steps: scan (fail-fast) -> review (advisory) -> STRIDE (advisory) -> auto-fix if issues found.

## Files to Modify

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/commands/watch/types.ts` | Edit | +2 (add PhaseType entries) |
| `src/commands/watch/phases/model-router.ts` | Edit | +2 (add phase configs) |
| `src/commands/watch/phases/security-flow.ts` | Create | ~165 |
| `src/commands/watch/phases/post-ship-runner.ts` | Edit | ~15 (replace inline block, add import) |

## Implementation Steps

### Step 1: Add PhaseType entries to `types.ts`

Add `security_review` and `security_stride` to the `PhaseType` union at line 39-45:

```typescript
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'security_review' | 'security_stride'    // <-- ADD
  | 'scout' | 'code_review'
  | 'scenario' | 'ui_test'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';
```

### Step 2: Add phase configs to `model-router.ts`

Add after the existing `security` entry (line 14):

```typescript
security_review: { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
security_stride: { model: 'sonnet', effort: 'medium', maxTurns: 5, timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
```

- `security_review` — same as `code_review` (read-only analysis)
- `security_stride` — 5 turns / 5min for deeper STRIDE threat modeling

### Step 3: Create `security-flow.ts`

Follow `test-flow.ts` pattern exactly. Module structure:

```typescript
// Imports
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { addComment } from './label-manager.js';

// Config & Result interfaces
export interface SecurityFlowConfig {
  repo: string;
  autoMode: boolean;
  cwd?: string;
}

export interface SecurityFlowResult {
  redPass: boolean;
  results: PhaseResult[];
}

// Result parsing patterns
const SECURITY_RESULT_PATTERN = /SECURITY_RESULT:\s*(PASS|FAIL)\s*[—\-]\s*(.+)/i;
const VULN_PATTERN = /vulnerabilit|critical|high.*risk|injection|xss|sqli|auth.*bypass|data.*leak|secret.*exposed/i;

function parseSecurityResult(output: string): boolean { ... }

// Prompt builders
function buildScanPrompt(issue): string { ... }       // /ck:security-scan
function buildReviewPrompt(issue): string { ... }      // /ck:code-review --security
function buildStridePrompt(issue): string { ... }      // /ck:security (STRIDE)
function buildFixPrompt(issue, findings): string { ... } // /ck:fix --security
function buildRedTestComment(...): string { ... }      // GitHub comment

// Main export
export async function executeSecurityFlow(
  classified: ClassifiedIssue,
  config: SecurityFlowConfig,
): Promise<SecurityFlowResult> { ... }
```

**Pipeline logic:**

```
1. /ck:security-scan — OWASP + secrets + deps scan
   - Phase: 'security'
   - FAIL blocks pipeline (return redPass: false)

2. /ck:code-review --security — deep security review
   - Phase: 'security_review'
   - Advisory: never blocks, but findings accumulate

3. /ck:security — STRIDE threat modeling
   - Phase: 'security_stride'
   - Advisory: never blocks, but findings accumulate

4. /ck:fix --security — auto-fix (CONDITIONAL)
   - Phase: 'fix'
   - Only runs if scan or review found issues (VULN_PATTERN match in outputs)
   - Advisory: fix attempt is best-effort

5. Post red test summary comment on issue
```

**Prompt templates:**

Scan prompt:
```
/ck:security-scan Run OWASP security audit on changes for #{number}: {title}

Check for:
- OWASP Top 10 vulnerabilities
- Hardcoded secrets and API keys
- Vulnerable dependencies (npm audit / pip audit)
- Insecure configurations

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [what was found]
```

Review prompt:
```
/ck:code-review --security Deep security code review for #{number}: {title}

Focus on:
- Input validation at system boundaries
- Authentication and authorization flaws
- Injection vectors (SQL, command, path traversal)
- Data exposure and information leaks
- Cryptographic weaknesses
- Race conditions and TOCTOU bugs

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [what was found]
```

STRIDE prompt:
```
/ck:security Perform STRIDE threat modeling for #{number}: {title}

Analyze using STRIDE categories:
- Spoofing: Can identity be faked?
- Tampering: Can data be modified?
- Repudiation: Can actions be denied?
- Information Disclosure: Can data leak?
- Denial of Service: Can service be disrupted?
- Elevation of Privilege: Can access be escalated?

Report results as:
SECURITY_RESULT: PASS — [summary]
or
SECURITY_RESULT: FAIL — [threats identified]
```

Fix prompt:
```
/ck:fix --security Auto-fix security issues found in #{number}: {title}

Issues to fix:
{accumulated findings from scan + review + STRIDE}

Apply fixes for identified vulnerabilities. Prioritize critical/high severity first.
```

**Comment template:**
```markdown
<!-- claude-swarm:red-test -->
{icon} **Red Test Result for #{issueNum}: {status}**

| Phase | Result |
|-------|--------|
| Security Scan | {scanStatus} |
| Security Review | {reviewStatus} |
| STRIDE Analysis | {strideStatus} |
| Auto-Fix | {fixStatus} |
```

### Step 4: Wire into `post-ship-runner.ts`

Replace the inline security block (lines 57-64) with a call to `executeSecurityFlow()`.

**Add import:**
```typescript
import { executeSecurityFlow, type SecurityFlowConfig } from './security-flow.js';
```

**Replace lines 57-64 with:**
```typescript
// 2. Security flow (red testing) — runs when issue has "security" label
if (classified.flags.securityScan) {
  const securityConfig: SecurityFlowConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const securityResult = await executeSecurityFlow(classified, securityConfig);
  results.push(...securityResult.results);

  // Red test failure is advisory — does NOT block pipeline
  // (per roadmap: only GREEN FAIL blocks, RED is informational)
}
```

## Todo

- [x] Add `security_review`, `security_stride` to PhaseType union in types.ts
- [x] Add `security_review`, `security_stride` configs to model-router.ts
- [x] Create security-flow.ts with full red testing pipeline
- [x] Replace inline security block in post-ship-runner.ts with executeSecurityFlow()
- [x] Verify TypeScript compiles cleanly

## Success Criteria

- `security-flow.ts` < 200 lines, follows test-flow.ts pattern exactly
- All 4 VividKit commands wired: `/ck:security-scan`, `/ck:code-review --security`, `/ck:security`, `/ck:fix --security`
- `/ck:fix --security` only triggers when vulnerabilities detected
- GitHub comment posted with red test summary table
- `post-ship-runner.ts` delegates to `executeSecurityFlow()` instead of inline invocation
- TypeScript compiles with no errors
- No changes to any other existing modules

## Risk Assessment

- **Low risk**: Follows established test-flow.ts pattern exactly
- **Advisory-only**: Red testing never blocks the pipeline (per roadmap)
- **Backward compatible**: Existing `security` phase config unchanged; only adds new types
