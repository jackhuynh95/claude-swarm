---
phase: 2
title: Wire green/red test pipeline into post-ship
status: done
files_modify: [src/commands/watch/phases/post-ship-runner.ts]
files_create: []
---

# Phase 2 — Wire Green/Red Test Pipeline into Post-Ship

## Overview

Restructure `post-ship-runner.ts` to run green testing (test-flow) FIRST, then red testing (security-flow) only if green passes. Currently security runs first and e2e runs standalone — both need reordering.

## Context

- `post-ship-runner.ts:77-217` — current pipeline: security → e2e → scout → predict → ship → design → slack → journal → llms → record
- `test-flow.ts` — complete green testing module (scenario → test → ui-test → e2e), already handles e2e internally
- `security-flow.ts` — complete red testing module, already imported in post-ship

## Current Pipeline Order (post-ship-runner.ts)

```
1. Security flow (advisory, when security label)
2. E2E (fail-fast)
3. Scout
4. Predict (hardMode only)
5. Ship (/ck:ship → fallback)
6. Design review
7. Slack report
8. Journal
9. LLMs docs
10. Run recorder
```

## New Pipeline Order

```
1. GREEN: test-flow (scenario → test → ui-test → e2e) — FAIL stops pipeline
2. RED: security-flow (scan → review → STRIDE → fix) — only if GREEN PASS + security label
3. Scout
4. Predict (hardMode only)
5. Ship (/ck:ship → fallback)
6. Design review
7. Slack report
8. Journal
9. LLMs docs
10. Run recorder
```

## Implementation Steps

### 1. Add test-flow import

At top of `post-ship-runner.ts`, add:

```typescript
import { executeTestFlow, type TestFlowConfig } from './test-flow.js';
```

### 2. Add green/red config to PostShipConfig

Add `baseUrl` is already there. No changes needed to config interface.

### 3. Restructure pipeline in executePostShip()

Replace steps 1-2 (security + standalone e2e) with:

```typescript
// 1. GREEN TESTING — test-flow (includes e2e internally)
const testConfig: TestFlowConfig = {
  repo: config.repo,
  autoMode: config.autoMode,
  baseUrl: config.baseUrl,
  cwd: config.cwd,
};
const greenResult = await executeTestFlow(classified, testConfig);
results.push(...greenResult.results);

if (!greenResult.greenPass) {
  return { results, verdict: 'FAIL', pipelinePassed: false, shipPath: 'none' };
}

// 2. RED TESTING — security-flow (only if GREEN PASS + security label)
if (classified.flags.securityScan) {
  const securityConfig: SecurityFlowConfig = {
    repo: config.repo,
    autoMode: config.autoMode,
    cwd: config.cwd,
  };
  const securityResult = await executeSecurityFlow(classified, securityConfig);
  results.push(...securityResult.results);
  // Security is advisory — never blocks pipeline
}
```

### 4. Remove standalone e2e block

The old standalone `executeE2e()` call (lines ~97-109) is removed. test-flow handles e2e internally via `executeE2e()` in its step 4.

### 5. Remove standalone e2e imports (if unused)

Check if `executeE2e` and `E2eConfig` are still used elsewhere in the file. If not, remove the import.

## Todo

- [x] Add `executeTestFlow` import from `./test-flow.js`
- [x] Replace security + e2e steps with green-then-red pipeline
- [x] Remove standalone e2e call and unused imports
- [x] Keep scout, predict, ship, design-review, slack, journal, llms, record unchanged
- [x] Compile check: `npx tsc --noEmit`

## Success Criteria

- Green test runs FIRST in post-ship pipeline
- Red test runs ONLY after green pass AND when security label present
- E2E not duplicated (test-flow handles it)
- Pipeline FAIL if green fails (before ship attempt)
- Security remains advisory (never blocks)
- All other post-ship steps unchanged

## Risk

- **E2E duplication**: test-flow already calls `executeE2e()`. Old standalone e2e in post-ship must be removed to avoid running e2e twice.
- **Import cleanup**: removing `executeE2e`/`E2eConfig` import may break if used elsewhere — verify first.
