---
phase: 01
status: ready
priority: high
effort: medium
---

# Phase 01 — Enhance Journal Writer with Rich Daily Format

## Context

- Current `journal-writer.ts`: [src/commands/watch/phases/journal-writer.ts](../../src/commands/watch/phases/journal-writer.ts)
- Obsidian journal skill: [.claude/skills/obsidian-journal/obsidian-journal.md](../../.claude/skills/obsidian-journal/obsidian-journal.md)
- Types: [src/commands/watch/types.ts](../../src/commands/watch/types.ts)

## Overview

Current journal-writer produces a basic entry. Enhance to:
1. Richer daily format with structured sections (issues completed, decisions, lessons, unresolved)
2. Explicit notes extraction with [[wikilinks]] for reusable lessons/patterns
3. Append correctly to existing daily notes

## Requirements

### Functional
- Daily entry includes: issue summary, type, verdict, PR, duration, decisions made, lessons learned, unresolved items
- Lessons/patterns extracted to `obsidian-vault/Notes/{descriptive-name}.md` with [[wikilinks]] back to daily
- Daily entries append with `## Dev Session N — HH:MM` format (matching obsidian-journal skill convention)
- Frontmatter on new daily files: date, tags, projects

### Non-functional
- Best-effort — never blocks pipeline (keep existing error handling)
- Claude CLI invocation stays under journal phase timeout

## Implementation Steps

1. **Enhance `buildJournalPrompt()`** in `journal-writer.ts`:
   - Add structured sections to the prompt template:
     ```
     ### What Was Done
     - Issue #{number}: {title} ({type})
     - Verdict: {verdict}
     - PR: {prUrl}
     - Duration: {duration}
     
     ### Decisions Made
     [Extract from flow results — any architectural or approach choices]
     
     ### Lessons Learned
     [Non-obvious insights from errors, retries, or unexpected behavior]
     
     ### Unresolved
     [Items that need follow-up — failed phases, partial verdicts, open questions]
     ```
   - Use `## Dev Session N — HH:MM` heading format
   - Add instruction to count existing `## Dev Session` headings for correct N

2. **Add notes extraction instructions** to the prompt:
   - If lessons identified, create `obsidian-vault/Notes/{topic}.md` with wikilink `[[YYYY-MM-DD]]`
   - Use `---` frontmatter with tags: `[lesson, claude-swarm]` or `[pattern, claude-swarm]`
   - Keep note names descriptive and kebab-case

3. **Pass richer context** to the prompt:
   - Include error details from failed phases (already available via `flowResults`)
   - Include phase retry counts if available
   - Include any verify concerns from `VerifyVerdict`

## Files to Modify

| File | Change |
|------|--------|
| `src/commands/watch/phases/journal-writer.ts` | Enhance `buildJournalPrompt()` |

## Todo

- [x] Enhance `buildJournalPrompt()` with structured daily format
- [x] Add notes extraction instructions to prompt
- [x] Add richer context (errors, retries, concerns) to prompt data
- [x] Verify journal-writer still compiles

## Success Criteria

- Journal entries follow `## Dev Session N — HH:MM` format
- Entries include: What Was Done, Decisions Made, Lessons Learned, Unresolved sections
- Prompt instructs Claude to extract lessons to Notes/ with [[wikilinks]]
- No changes to error handling — still best-effort, never blocks
