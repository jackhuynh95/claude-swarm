# Phase 3 — implement-roadmap-grill-me-debrief.md Updates

**Priority**: Medium
**Status**: Pending
**File**: `docs/implement-roadmap-grill-me-debrief.md`

## Overview

Update the roadmap doc to:
1. Mark G6 tasks 31 (cli-usage-guide) and 32 (README) as **Complete** after phase 1+2 execute
2. Add a prominent "New-Topic Builder Workflow" callout near the top
3. Keep all other tasks/phases unchanged

## Related Code Files

- `docs/implement-roadmap-grill-me-debrief.md` — primary target

## Implementation Steps

### Step 1 — Add new-topic builder workflow callout after the intro block

Insert after the `**Compatibility rule**` line and before `---`:

```markdown
## New-Topic Builder Workflow (v1 Active Path)

This is the active builder workflow for new topics as of 2026-04-14:

```text
1. claude-swarm grill-me "<topic>"     # Opus — clarify, surface decisions
   └── writes plans/<dir>/spec.md

2. /ck:plan --fast @spec.md            # Sonnet — phase files from resolved design

3. /ck:cook --auto                     # Sonnet — implement

4. test / review / commit

5. claude-swarm debrief                # Compare spec vs plan vs built
   └── writes plans/<dir>/debrief.md
```

**Watcher flow**: unchanged for now. Watcher integration deferred until poll-safe state exists.
**Existing guides**: not rewritten automatically. New topics only.
```

### Step 2 — Mark G6 tasks 31 + 32 as Complete

In the Phase G6 table, change:

```markdown
| 31 | Update `docs/cli-usage-guide.md` with new commands and examples | Pending |
| 32 | Update `README.md` workflow diagram to show specifications/building/evaluation | Pending |
```

to:

```markdown
| 31 | Update `docs/cli-usage-guide.md` with new commands and examples | Complete |
| 32 | Update `README.md` workflow diagram to show specifications/building/evaluation | Complete |
```

### Step 3 — Update Summary table G6 status

In the Summary table, update G6 row:

```markdown
| G6 | CLI + docs surface | `src/index.ts`, `docs/cli-usage-guide.md`, `README.md` | 6 | **Partial** (docs done, CLI pending) |
```

## Todo

- [ ] Add new-topic builder workflow callout after intro block
- [ ] Mark G6 tasks 31 + 32 as Complete
- [ ] Update G6 summary status to Partial

## Success Criteria

- New-topic workflow is visible at a glance near top of roadmap
- G6 task status accurately reflects docs-complete / CLI-pending state
- Rest of roadmap unchanged
