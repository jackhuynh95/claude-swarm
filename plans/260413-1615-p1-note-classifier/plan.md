---
status: complete
created: 2026-04-13
scope: P1 — Project Note Classifier
mode: fast
blockedBy: []
blocks: []
---

# P1 — Project Note Classifier

## Overview

Create `src/commands/sync/note-classifier.ts` — Claude-powered classifier that reads project vault notes and classifies them as `promote` or `skip` with category tagging.

**Priority**: P1 (primary-first, inside current target project only)
**Model**: haiku via Anthropic SDK (cheap, classification is simple)
**Batch**: supported — multiple notes in one API call

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Implement note-classifier](./phase-01-implement-note-classifier.md) | Complete |

## Dependencies

- `@anthropic-ai/sdk` — new dependency (direct API calls, not Claude CLI)
- `zod` — already installed (v4.3.6), for response schema validation
- Existing: `vault-context-loader.ts` reads vault notes (complementary, not conflicting)

## Cook Command

```bash
/ck:cook --auto plans/260413-1615-p1-note-classifier/phase-01-implement-note-classifier.md
```
