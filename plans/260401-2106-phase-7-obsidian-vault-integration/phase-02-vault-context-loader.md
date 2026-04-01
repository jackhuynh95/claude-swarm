---
phase: 02
status: ready
priority: high
effort: medium
---

# Phase 02 — Vault Context Loader for Planning

## Context

- Ship flow: [src/commands/watch/phases/ship-flow.ts](../../src/commands/watch/phases/ship-flow.ts)
- Vault path: `obsidian-vault/` relative to project root
- Notes dir: `obsidian-vault/Notes/` — lessons, patterns, decisions

## Overview

Before the planning phase in ship-flow, read relevant notes from `obsidian-vault/Notes/` to give the planner historical context. This enables the watcher to learn from past decisions and avoid repeating mistakes.

## Requirements

### Functional
- Read markdown files from `obsidian-vault/Notes/` directory
- Filter to recent/relevant notes (last 30 days or matching issue keywords)
- Inject condensed context into the plan prompt
- Graceful fallback if vault is empty or missing

### Non-functional
- Fast — file reads only, no Claude invocation
- Context size bounded — max 2000 chars injected into prompt
- Never blocks planning if vault read fails

## Architecture

```
vault-context-loader.ts
  ├── loadVaultContext(vaultPath, issue) → string
  │   ├── readNotes(notesDir) → NoteFile[]
  │   ├── filterRelevant(notes, issue) → NoteFile[]
  │   ├── summarize(notes, maxChars) → string
  │   └── return contextString (or empty on error)
```

## Implementation Steps

1. **Create `vault-context-loader.ts`**:
   ```typescript
   import { readdir, readFile, stat } from 'node:fs/promises';
   import { join } from 'node:path';
   import type { GHIssue } from '../types.js';
   
   interface VaultNote {
     name: string;
     content: string;
     modifiedAt: Date;
   }
   ```

2. **`loadVaultContext(vaultPath: string, issue: GHIssue): Promise<string>`**:
   - Read all `.md` files from `{vaultPath}/Notes/`
   - Filter: modified in last 30 days OR filename keywords match issue title words
   - Sort by relevance (keyword match first, then recency)
   - Truncate to 2000 chars total
   - Return formatted string: `## Vault Context\n{notes}`
   - On any error → return empty string (log warning)

3. **Wire into `ship-flow.ts`**:
   - Import `loadVaultContext`
   - Before `buildPlanPrompt()`, call `loadVaultContext(vaultPath, issue)`
   - Append context to plan prompt if non-empty
   - Add `vaultPath` to `ShipFlowConfig`

## Files to Create

| File | Purpose |
|------|---------|
| `src/commands/watch/phases/vault-context-loader.ts` | Read and filter vault notes |

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/phases/ship-flow.ts` | Add vaultPath to config, inject vault context into plan prompt |

## Todo

- [x] Create `vault-context-loader.ts` with `loadVaultContext()`
- [x] Add keyword matching and recency filtering
- [x] Add 2000-char truncation
- [x] Add `vaultPath` to `ShipFlowConfig`
- [x] Wire vault context into `buildPlanPrompt()` in ship-flow.ts
- [x] Verify compiles

## Success Criteria

- `loadVaultContext()` returns relevant notes or empty string
- Ship-flow plan prompt includes vault context when available
- No failures if vault is empty or missing
- Context injection bounded to 2000 chars
