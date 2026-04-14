# Phase 2 — cli-usage-guide.md Updates

**Priority**: High
**Status**: Pending
**File**: `docs/cli-usage-guide.md`

## Overview

Add `grill-me` and `debrief` command sections. Update commands table. Add a note to `build generate` about the new grill-me pre-step for new topics.

## Related Code Files

- `docs/cli-usage-guide.md` — primary target

## Implementation Steps

### Step 1 — Add grill-me + debrief to Commands table

In the `## Commands` table, add two rows:

| Command | Description |
|---------|-------------|
| `grill-me` | Spec interview before planning — asks sharp questions, writes spec artifact |
| `debrief` | Post-build comparison — compares spec/plan/built result, records deferrals |

Insert before `build` row to preserve ordering context.

### Step 2 — Add `## grill-me` section

Insert before `## build` section:

```markdown
## grill-me

Run a focused spec-interview before planning. Forces hidden assumptions into the open, proposes decision branches, and writes a compact spec artifact (`plans/<dir>/spec.md`).

```bash
claude-swarm grill-me <topic> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `<topic>` | **Required.** Topic, request, or issue description to clarify | — |
| `-c, --context <file>` | Context file for background (`@filepath`) | — |
| `-o, --output <dir>` | Output directory for spec artifact | `plans/` |
| `-m, --model <model>` | Model override: `opus` (default), `sonnet`, `haiku` | `opus` |

### What It Produces

`grill-me` writes a `spec.md` artifact with these sections:

- **Summary** — one-line problem statement
- **Scope** — what is in scope
- **Non-goals** — what is explicitly out of scope
- **Decision log** — accepted and rejected options
- **Open questions** — deferred without blocking
- **Acceptance criteria** — definition of done

### When to Use

- Before any medium/large feature or roadmap work
- Before running `claude-swarm build generate` or `/ck:plan`
- Skip for tiny fixes (single file, <5 line change)

### New-Topic Builder Flow

After `grill-me` resolves the design, shift to lightweight executor mode:

```bash
# 1. Clarify
claude-swarm grill-me "Upgrade payment webhook retry strategy"

# 2. Review spec artifact at plans/<dir>/spec.md

# 3. Plan (fast — spec already resolved the design)
/ck:plan --fast @plans/<dir>/spec.md

# 4. Cook
/ck:cook --auto

# 5. Debrief
claude-swarm debrief --spec @plans/<dir>/spec.md --plan @plans/<dir>/plan.md
```

### Examples

```bash
# Clarify a new feature before planning
claude-swarm grill-me "Add Stripe payments to checkout"

# With context file
claude-swarm grill-me "Migrate auth to OAuth2" --context @docs/security-standards.md

# Dry run (show questions only, no artifact written)
claude-swarm grill-me "Add rate limiting" --dry-run
```
```

### Step 3 — Add `## debrief` section

Insert before `## status` section:

```markdown
## debrief

Post-build comparison step. Compares requested scope, clarified spec, generated plan, and built result. Records what matched, what changed, what was deferred, and what follow-up tasks exist.

```bash
claude-swarm debrief [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <file>` | Spec artifact path (`@filepath`) | auto-detect from active plan |
| `--plan <file>` | Plan artifact path (`@filepath`) | auto-detect from active plan |
| `--phase <n>` | Scope debrief to a specific phase | — |
| `-o, --output <dir>` | Output directory for debrief artifact | `plans/<dir>/` |
| `-m, --model <model>` | Model override: `sonnet`, `opus`, `haiku` | `sonnet` |

### What It Produces

`debrief` writes a `debrief.md` artifact answering:

- Did we build what we said we would build?
- Which decisions changed during implementation?
- Which edge cases appeared only during coding/testing?
- What was intentionally deferred?
- What should become the next task or issue?

### When to Use

- After completing any non-trivial feature or roadmap phase
- Required for: features, roadmaps, architectural changes
- Optional for: tiny fixes

### Examples

```bash
# Debrief using auto-detected plan
claude-swarm debrief

# Debrief with explicit spec and plan
claude-swarm debrief \
  --spec @plans/260414-1643-my-feature/spec.md \
  --plan @plans/260414-1643-my-feature/plan.md

# Debrief specific phase only
claude-swarm debrief --plan @docs/implement-roadmap-x.md --phase 2
```
```

### Step 4 — Update `build generate` section

Add a compatibility note after the `### generate` heading and before options table:

```markdown
> **New topics**: `build generate` now runs `grill-me` first to clarify scope before generating the roadmap.
> **Existing topics**: If a generated guide already exists (e.g., `docs/implement-roadmap-my-feature.md`), it is used as-is — no automatic rewrite.
```

### Step 5 — Update 14-State lifecycle comment (optional)

No change needed — grill-me + debrief are pre-watch and post-build, not watcher states.

## Todo

- [ ] Add grill-me + debrief to commands table
- [ ] Add `## grill-me` section before `## build`
- [ ] Add `## debrief` section before `## status`
- [ ] Add compatibility note to `build generate` section

## Success Criteria

- `grill-me` and `debrief` are documented with options, examples, and when-to-use guidance
- Existing command sections untouched
- New-topic flow is clearly illustrated end-to-end
