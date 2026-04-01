# Phase 5: Journal Writer

**Priority**: Medium
**Status**: Complete
**File**: `src/commands/watch/phases/journal-writer.ts`

---

## Overview

Obsidian vault integration. Writes daily journal entry + extracts lessons/patterns to Notes after each issue completion. Uses 'journal' PhaseType (haiku, 30s, 1 turn, Write tool).

## Context Links

- Types: `src/commands/watch/types.ts` (PhaseType='journal')
- Model config: `src/commands/watch/phases/model-router.ts` (journal: haiku, 30s, 1 turn, Write)
- Obsidian rules: `.claude/rules/obsidian-integration.md` (vault structure, /obsidian-journal)
- Vault structure: `obsidian-vault/Daily/`, `obsidian-vault/Notes/`

## Key Insights

- Two outputs: Daily journal entry + optional Notes extraction
- Daily journal: what was done, decisions made, lessons learned, unresolved items
- Notes: reusable patterns or lessons extracted to `obsidian-vault/Notes/`
- Uses haiku (cheapest) — journal is structured data, not creative writing
- Never blocks pipeline — journaling is best-effort
- Journal filename: `YYYY-MM-DD.md` in `obsidian-vault/Daily/`

## Architecture

```
Input: ClassifiedIssue + JournalConfig + flowResults + verifyVerdict
  │
  ├─ 1. Build journal context from all phase results:
  │     - Issue number, title, type
  │     - Verdict, PR URL
  │     - Duration per phase
  │     - Any errors or concerns
  │
  ├─ 2. Invoke haiku to write journal entry
  │     - Prompt includes vault path + format template
  │     - Claude uses Write tool to create/append daily file
  │
  ├─ 3. If notable patterns/lessons detected:
  │     - Extract to obsidian-vault/Notes/ as separate file
  │     - Add [[wikilinks]] to daily entry
  │
  └─ 4. Return PhaseResult (always success unless write fails)
```

## Related Code Files

**Modify**: None
**Create**: `src/commands/watch/phases/journal-writer.ts`
**Read**: `types.ts`, `claude-invoker.ts`, `.claude/rules/obsidian-integration.md`

## Implementation Steps

1. Create `journal-writer.ts` with exports:
   ```typescript
   export interface JournalConfig {
     repo: string;
     autoMode: boolean;
     vaultPath: string;     // path to obsidian-vault/ directory
     cwd?: string;
   }
   ```
2. Implement `executeJournal(classified, config, flowResults, verifyVerdict?)`:
   - Build context summary from all flowResults
   - Format today's date as YYYY-MM-DD
   - Build prompt:
     ```
     Write a daily journal entry for the obsidian vault.
     
     Vault path: {vaultPath}
     Daily file: {vaultPath}/Daily/{YYYY-MM-DD}.md
     
     Issue: #{number} — {title} ({issueType})
     Verdict: {verdict}
     PR: {prUrl}
     Duration: {totalDuration}
     Phases completed: {summary}
     Errors: {errorSummary or "none"}
     
     Format the entry as:
     ## {HH:MM} — Issue #{number}: {title}
     - **Type**: {issueType}
     - **Verdict**: {verdict}
     - **PR**: {prUrl}
     - **Duration**: {duration}
     - **Summary**: [1-2 sentences on what was done]
     - **Lessons**: [any non-obvious insights, or "none"]
     
     If the daily file exists, APPEND to it. If not, create with frontmatter:
     ---
     date: {YYYY-MM-DD}
     tags: [daily, claude-swarm]
     ---
     
     If you identify reusable lessons or patterns, also create a note in:
     {vaultPath}/Notes/{descriptive-name}.md
     with [[wikilinks]] back to the daily entry.
     ```
3. Invoke via `invokeClaudePhase(prompt, 'journal', undefined, autoMode, cwd)`
   - No modelOverride — always haiku for journaling
4. Never transition labels — journaling doesn't change issue state
5. Never block pipeline — catch all errors
6. Return PhaseResult

## Todo

- [x] Create journal-writer.ts file
- [x] Export JournalConfig type
- [x] Implement executeJournal() with context builder
- [x] Build obsidian-format journal prompt
- [x] Handle append-to-existing daily file
- [x] Handle Notes extraction for lessons/patterns
- [x] Ensure never blocks pipeline
- [x] Verify `npm run build` compiles

## Success Criteria

- Creates/appends to `obsidian-vault/Daily/YYYY-MM-DD.md`
- Extracts notable lessons to `obsidian-vault/Notes/`
- Uses [[wikilinks]] between daily and notes
- Never blocks pipeline on failure
- Uses haiku (cheapest model)

## Risk Assessment

- **Vault directory missing**: Prompt tells Claude to create file — mkdir -p equivalent
- **Concurrent writes**: Multiple issues completing same day → append works, but format might break
- **30s timeout**: Tight for write + notes extraction — but haiku is fast, 1 turn should suffice
