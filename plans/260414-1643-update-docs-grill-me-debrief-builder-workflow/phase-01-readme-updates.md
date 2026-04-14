# Phase 1 — README.md Updates

**Priority**: High
**Status**: Pending
**File**: `README.md`

## Overview

Update README to surface the new-topic builder workflow (spec-first: grill-me → spec.md → plan → cook → debrief) without breaking or rewriting existing content.

## Related Code Files

- `README.md` — primary target

## Implementation Steps

### Step 1 — Update "What It Does" section

Add a new builder workflow block below the watcher routing table.

Append after the closing ` ``` ` of the GitHub Issues routing diagram:

```markdown
## New-Topic Builder Workflow (Spec-First)

For new features, roadmaps, and architectural changes — use the spec-first builder path:

```
New Topic or Request
  │
  ├── grill-me        → Spec Interview: sharp questions, decisions, acceptance criteria
  ├── spec.md         → Durable spec artifact (plans/<dir>/spec.md)
  ├── /ck:plan --fast → Phase files (Sonnet executor mode)
  ├── /ck:cook        → Implementation
  ├── test / review   → Verify
  └── debrief         → Debrief artifact: matched, changed, deferred, follow-ups
```

**Compatibility**: Existing generated guides and in-progress topic workflows are not affected.
New topics use the `grill-me` entrypoint. Old topics continue as-is.
```

### Step 2 — Update Architecture diagram

In the Architecture ASCII block, replace:
```
│  Standalone CLI Tools                          │
│  slack-reader · brainstormer · status          │
```
with:
```
│  Standalone CLI Tools                          │
│  grill-me · debrief · slack-reader · status    │
```

### Step 3 — Update "What's Added" capability table

Add two rows to the table:

| Capability | Description |
|---|---|
| **Spec-first workflow** | `grill-me` clarification stage before planning — forces decisions, prevents dark code |
| **Debrief traces** | Post-build comparison: spec vs plan vs built result, records deferrals and follow-ups |

### Step 4 — Update Model Routing table

Add two rows:

| Role | Model | Effort | Why |
|---|---|---|---|
| Grill-Me | opus | max | Challenge assumptions, surface hidden decisions |
| Debrief | sonnet | medium | Compare artifacts, extract follow-ups |

### Step 5 — Update Docs table

Add entry:

| Doc | Purpose |
|---|---|
| [implement-roadmap-grill-me-debrief.md](docs/implement-roadmap-grill-me-debrief.md) | Grill-Me + Debrief roadmap — specification-first workflow design |

## Todo

- [ ] Add new-topic builder workflow block under "What It Does"
- [ ] Update Architecture diagram (Standalone CLI Tools line)
- [ ] Add Spec-first workflow + Debrief traces to capability table
- [ ] Add Grill-Me + Debrief rows to Model Routing table
- [ ] Add grill-me-debrief roadmap doc to Docs table

## Success Criteria

- README shows the 3-block workflow (specifications / building / evaluation) for new topics
- Old watcher routing diagram untouched
- No rewrite of existing content — additive only
