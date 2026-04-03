# Model & Effort Routing — Flexible 3-Level Override

**Date**: 2026-04-03
**Status**: Complete
**Priority**: High
**Roadmap ref**: Tasks M1–M5 + Task #4 (debug --parallel)

---

## Goal

Make model + effort configurable per phase via 3-level override chain:
```
CLI flag (--model opus --effort high) > .claude-swarm.json > model-router.ts defaults
```

Also: add `--parallel` flag to debug-flow for multiple related bugs.

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | [Refactor model-router + extend config](phase-01-model-router-refactor.md) | model-router.ts, config-resolver.ts, types.ts | Complete |
| 2 | [CLI flags for watch + build commands](phase-02-cli-flags.md) | watch-command.ts, build-command.ts, epic-executor.ts | Complete |
| 3 | [Debug-flow --parallel flag](phase-03-debug-parallel.md) | debug-flow.ts, issue-router.ts, types.ts | Complete |

## Architecture

```
┌─────────────────────────────────────────────────┐
│ CLI flags: --model opus --effort high           │
└──────────────────────┬──────────────────────────┘
                       │ highest priority
                       ▼
┌─────────────────────────────────────────────────┐
│ .claude-swarm.json → models.{phase}.model/effort│
└──────────────────────┬──────────────────────────┘
                       │ mid priority
                       ▼
┌─────────────────────────────────────────────────┐
│ PHASE_CONFIGS[phase] (model-router.ts defaults) │
└─────────────────────────────────────────────────┘
                       │ lowest priority
                       ▼
                  PhaseConfig
```

## Key Decisions

1. **Config shape**: `models` key in `.claude-swarm.json` maps kebab-case phase names to `{ model, effort }`
2. **Phase key mapping**: Config uses kebab-case (`plan-red-team`, `security-review`) → mapped to PhaseType (`plan_redteam`, `security_review`)
3. **CLI override is global**: `--model` and `--effort` override ALL phases (cost-saving mode)
4. **Per-phase CLI override not needed**: Too complex, config file handles per-phase
5. **Builder uses model-router**: Replace hardcoded `MODEL_MAP` in epic-executor.ts with `getPhaseConfig()`
6. **Add `cook` PhaseType**: Builder needs it, watcher ship-flow should use it instead of `fix`

## Cook command

```
/ck:cook --auto @plans/260403-1458-model-effort-routing/plan.md
```
