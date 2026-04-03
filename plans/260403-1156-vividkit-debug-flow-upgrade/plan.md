---
title: VividKit Debug Flow Upgrade
status: complete
priority: high
created: 2026-04-03
mode: fast
blockedBy: []
blocks: []
roadmap: docs/implement-roadmap-vividkit-commands.md (Phase 1)
---

# VividKit Debug Flow Upgrade

Upgrade `debug-flow.ts` from 3-step custom loop (`/ck:debug` -> `/ck:fix` -> `/ck:test`) to VividKit's unified `/ck:fix` pipeline with smart flag routing.

## Phases

| Phase | File | Status |
|-------|------|--------|
| [Phase 1](phase-01-route-flags-types.md) | `types.ts`, `issue-router.ts` | Complete |
| [Phase 2](phase-02-debug-flow-upgrade.md) | `debug-flow.ts` | Complete |

## Key Changes

1. **Extend `RouteFlags`** — add `ciFailure`, `hasLogs`, `uiIssue`, `quickFix` flags
2. **Upgrade `issue-router.ts`** — detect new sub-types from labels/content
3. **Rewrite `debug-flow.ts`** — single `/ck:fix` call with flag routing, remove separate debug+test phases
4. **Add `/ck:problem-solving when-stuck`** — fallback after max retries exhausted

## Architecture

```
classify issue (issue-router.ts)
  │
  ├── RouteFlags populated with: hardMode, securityScan, ciFailure, hasLogs, uiIssue, quickFix
  │
  └── debug-flow.ts
      │
      ├── buildFixFlags(flags) → "--hard" | "--security" | "--ui" | "--ci" | "--logs" | "--quick" | "--auto"
      │
      ├── retry loop (max 3):
      │   ├── /ck:fix {flags} (single call = scout+diagnose+assess+fix+verify+prevent)
      │   ├── build check (with retry)
      │   └── success? → break
      │
      ├── mid-loop: /ck:problem-solving when-stuck (at cycle floor(max/2))
      ├── post-loop exhaust: /ck:problem-solving when-stuck (if all retries fail)
      │
      └── commit + label transition
```

## Cook Command

```bash
claude -p "/ck:cook --auto @plans/260403-1156-vividkit-debug-flow-upgrade/plan.md" \
  --model sonnet --effort medium --dangerously-skip-permissions
```
