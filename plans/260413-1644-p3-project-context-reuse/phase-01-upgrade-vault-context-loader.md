---
phase: 1
status: complete
priority: high
effort: medium
---

# Phase 1 — Upgrade vault-context-loader with Knowledge-first retrieval

## Context

- Current file: `src/commands/watch/phases/vault-context-loader.ts` (118 lines)
- Current consumer: `src/commands/watch/phases/ship-flow.ts` line 60
- Knowledge dirs created by P2: `Knowledge/Lessons/`, `Knowledge/Patterns/`, `Knowledge/Decisions/`
- Frontmatter written by `knowledge-writer.ts`: `date`, `category`, `source-phase`, `issue`, `project`, `tags`

## Key Insights

- Current `loadVaultContext` is tightly coupled to `GHIssue` — epic-executor can't use it
- Keyword extraction only uses title + body text; ignores frontmatter tags in Knowledge/ notes
- Scoring is flat (keyword * 2 + binary recency) — no category weighting
- Knowledge/ notes have structured frontmatter with `tags` and `category` fields — use them for better matching

## Requirements

### Functional
- Read Knowledge/ subdirs (Lessons, Patterns, Decisions) FIRST, then Notes/ as supplement
- Accept generic task context `{ title: string; description?: string }` instead of `GHIssue` only
- Parse frontmatter `tags` and `category` fields from Knowledge/ notes for matching
- Category priority weighting: patterns=3, decisions=2, lessons=1, raw-notes=0
- Graduated recency: 7d=3, 14d=2, 30d=1, >30d=0
- Combined score: `(keywordMatches * 2) + categoryWeight + recencyScore + tagMatchBonus`
- Increase max context to 3000 chars
- Backward-compatible: `loadVaultContext(vaultPath, issue)` still works (issue has title+body)

### Non-functional
- Never throws — graceful fallback on missing dirs
- No new dependencies
- Keep file under 200 lines

## Architecture

```
loadVaultContext(vaultPath, context)
  │
  ├─ readKnowledgeNotes(vaultPath)     ← NEW: Knowledge/Lessons + Patterns + Decisions
  │    └─ parse frontmatter for tags, category, date
  │
  ├─ readRawNotes(vaultPath)           ← EXISTING: Notes/ (renamed from readNotes)
  │
  ├─ extractKeywords(context)          ← UPDATED: accepts {title, description}
  │
  ├─ scoreAndRank(allNotes, keywords)  ← UPGRADED: category weight + graduated recency + tag bonus
  │
  └─ buildContextSummary(ranked, 3000) ← EXISTING: increased char limit
```

## Related Code Files

**Modify:**
- `src/commands/watch/phases/vault-context-loader.ts` — main upgrade
- `src/commands/watch/phases/ship-flow.ts` — update call site (adapt GHIssue → generic context)

**Read only:**
- `src/commands/sync/knowledge-writer.ts` — understand frontmatter format
- `src/commands/watch/types.ts` — GHIssue shape

## Implementation Steps

1. **Add `TaskContext` interface** — generic input replacing direct GHIssue dependency
   ```ts
   interface TaskContext {
     title: string;
     description?: string;
   }
   ```

2. **Add `VaultNote.source` and `VaultNote.tags` fields**
   ```ts
   interface VaultNote {
     name: string;
     content: string;
     modifiedAt: Date;
     relevanceScore: number;
     source: 'knowledge-pattern' | 'knowledge-decision' | 'knowledge-lesson' | 'raw-note';
     tags: string[];
   }
   ```

3. **Create `readKnowledgeNotes(vaultPath)`** — reads Knowledge/Lessons, Knowledge/Patterns, Knowledge/Decisions. Parses frontmatter for `tags` array and `category` string. Sets `source` based on subdirectory.

4. **Rename `readNotes` → `readRawNotes`** — same logic, sets `source: 'raw-note'`, `tags: []`.

5. **Update `extractKeywords`** — accept `TaskContext` instead of `GHIssue`. Use `context.title + (context.description ?? '')`.

6. **Create scoring constants**:
   ```ts
   const CATEGORY_WEIGHT: Record<VaultNote['source'], number> = {
     'knowledge-pattern': 3,
     'knowledge-decision': 2,
     'knowledge-lesson': 1,
     'raw-note': 0,
   };
   const RECENCY_TIERS = [
     { days: 7, score: 3 },
     { days: 14, score: 2 },
     { days: 30, score: 1 },
   ];
   const TAG_MATCH_BONUS = 2;
   ```

7. **Upgrade `filterAndScore`** — combine: `keywordMatches * 2 + categoryWeight + recencyScore + tagMatchBonus`. Tag matching: each keyword found in note's `tags[]` adds TAG_MATCH_BONUS.

8. **Update `loadVaultContext` signature** — accept `TaskContext` instead of `GHIssue`:
   ```ts
   export async function loadVaultContext(
     vaultPath: string,
     context: TaskContext,
   ): Promise<string>
   ```
   Read knowledge notes first, then raw notes. Merge, score, rank. Use 3000 char limit.

9. **Update `ship-flow.ts` call site** — adapt: `loadVaultContext(config.vaultPath, { title: issue.title, description: issue.body ?? undefined })`.

10. **Add simple frontmatter parser** — extract `tags` and `category` from `---` delimited YAML header. No dependency needed — simple regex split on `---`, then line-by-line key extraction for `tags:` and `category:`.

## Todo

- [x] Add TaskContext interface and update VaultNote interface
- [x] Create readKnowledgeNotes function with frontmatter parsing
- [x] Rename readNotes → readRawNotes
- [x] Update extractKeywords to accept TaskContext
- [x] Upgrade scoring with category weight, graduated recency, tag bonus
- [x] Update loadVaultContext signature and merge knowledge + raw notes
- [x] Increase MAX_CONTEXT_CHARS to 3000
- [x] Update ship-flow.ts call site
- [x] Compile check

## Success Criteria

- `loadVaultContext` reads Knowledge/ before Notes/
- Knowledge notes score higher than raw notes (same keyword match)
- Recent pattern notes rank highest
- ship-flow.ts compiles and passes existing behavior
- No new dependencies added
- File stays under 200 lines

## Risk Assessment

- **Frontmatter parsing edge cases**: Notes without frontmatter should not crash — default to empty tags, 'raw-note' source
- **Empty Knowledge/ dirs**: `readdir` may throw ENOENT — catch per-directory, not at top level
- **Backward compat**: ship-flow.ts passes GHIssue — we adapt at call site, not in loader
