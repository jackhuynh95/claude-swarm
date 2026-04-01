---
phase: 4
status: complete
priority: medium
effort: low
---

# Phase 4 — Capability Matrix

## Overview

Static capability matrix showing what's implemented, partial, planned, or rejected. Rendered as a terminal table via `claude-swarm status --matrix`.

## Architecture

Matrix data lives as a const array in `capability-matrix.ts`. Not a JSON file — it changes only with code, so it belongs in source.

```
claude-swarm status --matrix

▸ Capability Matrix
  Status: ✓ = implemented, ◐ = partial, ○ = planned, ✗ = rejected

  Capability                    Source          Status  Phase
  ─────────────────────────────────────────────────────────
  Daemon loop + poll            CK Fork         ✓       1
  State persistence             CK Fork         ✓       1
  Issue type routing            Auto-Claude     ✓       2
  Debug → fix → test loop       Auto-Claude     ✓       3
  Ship flow                     Auto-Claude     ✓       3
  Verifier agent                New             ○       4
  Budget guards                 New             ✓       6
  Obsidian journal              New             ✓       7
  Operator status               New             ✓       8
  ...
```

## Related Code Files

**Create:**
- `src/commands/status/capability-matrix.ts`

**Modify:**
- `src/commands/status/status-command.ts` — add --matrix flag

## Implementation Steps

1. Create `capability-matrix.ts`:
   - Define `CapabilityEntry` type: `{ name, source: 'ck-fork' | 'auto-claude' | 'new', status: 'implemented' | 'partial' | 'planned' | 'rejected', phase: number }`
   - Export `CAPABILITIES` const array with all entries from roadmap
   - Export `renderMatrix()` function that formats as aligned table with chalk colors

2. Wire into status command as `--matrix` flag

## Success Criteria

- [x] `--matrix` renders aligned, colored capability table
- [x] All capabilities from roadmap represented
- [x] Easy to update — just edit the const array
