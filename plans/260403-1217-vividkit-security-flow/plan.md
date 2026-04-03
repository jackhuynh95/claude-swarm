---
title: VividKit Security Flow (Red Testing)
status: complete
priority: high
created: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 4)
---

# VividKit Security Flow — Red Testing

Create `security-flow.ts` as a new phase module implementing security ("red") testing via VividKit commands: `/ck:security-scan`, `/ck:code-review --security`, `/ck:security` (STRIDE), `/ck:fix --security`. Wire into `post-ship-runner.ts` when `security` label is present.

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-security-flow-module.md) | `types.ts`, `model-router.ts`, `security-flow.ts`, `post-ship-runner.ts` | Complete |

## Key Changes

1. **Add `security_review` and `security_stride` to `PhaseType`** — distinct phase types for tracking/logging
2. **Add phase configs** — `security_review` (sonnet/medium) and `security_stride` (sonnet/medium, 5 turns, 5m timeout) in model-router
3. **Create `security-flow.ts`** — orchestrates red testing pipeline: scan -> review -> STRIDE -> auto-fix
4. **Upgrade `post-ship-runner.ts`** — replace inline security-scan with `executeSecurityFlow()` call

## Architecture

```
security-flow.ts (new)
  |
  |-- /ck:security-scan — OWASP + secrets + deps (existing 'security' phase)
  |-- /ck:code-review --security — deep security review ('security_review' phase)
  |-- /ck:security — STRIDE threat modeling ('security_stride' phase)
  |
  |-- issues found? -> /ck:fix --security — auto-fix (existing 'fix' phase)
  |
  |-- return SecurityFlowResult { redPass, results[] }
```

## Dependencies

- `types.ts` — add `security_review`, `security_stride` to PhaseType union
- `model-router.ts` — add configs for new phase types
- `claude-invoker.ts` — existing `invokeClaudePhase()` (no changes)
- `label-manager.ts` — existing `addComment()` (no changes)
- `post-ship-runner.ts` — replace inline security block with `executeSecurityFlow()`

## Integration Point

Called from `post-ship-runner.ts` when `classified.flags.securityScan` is true. Replaces the current inline `/ck:security-scan --full` invocation (lines 57-64) with the full red testing pipeline.

## Cook Command

```bash
claude -p "/ck:cook --auto @plans/260403-1217-vividkit-security-flow/plan.md" \
  --model sonnet --effort medium
```
