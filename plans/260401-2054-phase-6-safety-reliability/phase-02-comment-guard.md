# Phase 2: Comment Guard

**Priority**: High
**Status**: Complete
**Roadmap tasks**: #33 (comment loop prevention), #34 (maintainer-last detection)

## Overview

Prevent the bot from spamming issues. Two guards: (1) detect own bot comments to avoid loops, (2) detect when a maintainer has posted the last comment (discussion closed signal) and skip.

## Context Links

- `src/commands/watch/phases/label-manager.ts` — `addComment()` to guard
- `src/commands/watch/types.ts` — `GHIssue` shape

## Key Insights

- Bot comments are identifiable by the AI disclaimer prefix (from Phase 1)
- "Maintainer-last" means the repo owner/maintainer posted the final comment — the bot shouldn't pile on
- Guard runs BEFORE `addComment()`, not inside it — caller decides whether to skip
- Need `gh` CLI to fetch issue comments timeline

## Architecture

```
shouldSkipComment(repo, issueNum, botIdentifier?) → { skip: boolean; reason: string }
  1. getLastComments(repo, issueNum, count=5)
  2. Check: is last comment from bot? → skip (loop prevention)
  3. Check: is last comment from maintainer AND no new non-bot activity? → skip
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/comment-guard.ts`

**Modify:**
- `src/commands/watch/phases/ship-flow.ts` — guard before `addComment()` calls
- `src/commands/watch/phases/debug-flow.ts` — guard before `addComment()` calls

## Implementation Steps

1. Create `comment-guard.ts` with these exports:

2. **`getLastComments(repo: string, issueNum: number, count?: number): Promise<IssueComment[]>`**
   - Use `gh api repos/{owner}/{repo}/issues/{number}/comments --jq '.[-5:]'`
   - Parse into `IssueComment[]`: `{ author: string; body: string; createdAt: string }`
   - Return last `count` comments (default 5)

3. **`isBotComment(comment: IssueComment): boolean`**
   - Check if body starts with the AI disclaimer prefix string
   - Also check if author matches a configurable bot username (default: check for disclaimer only)

4. **`isMaintainerComment(repo: string, author: string): Promise<boolean>`**
   - Use `gh api repos/{owner}/{repo}/collaborators/{author}/permission`
   - Return true if permission is `admin` or `maintain`
   - Cache result per author for session (avoid repeated API calls)

5. **`shouldSkipComment(repo: string, issueNum: number): Promise<{ skip: boolean; reason: string }>`**
   - Fetch last 5 comments
   - If no comments → `{ skip: false, reason: '' }`
   - If last comment is bot → `{ skip: true, reason: 'loop-prevention: last comment is bot' }`
   - If last comment is maintainer AND second-to-last is bot → `{ skip: true, reason: 'maintainer-last: discussion appears closed' }`
   - Otherwise → `{ skip: false, reason: '' }`

6. Wire into `ship-flow.ts` and `debug-flow.ts`: before each `addComment()` call, check `shouldSkipComment()`. If skip, log reason and continue without commenting.

## Success Criteria

- [ ] Bot's own comments detected by disclaimer prefix
- [ ] Maintainer permission check via GitHub API
- [ ] Loop prevention: consecutive bot comments blocked
- [ ] Maintainer-last: bot doesn't comment after maintainer closes discussion
- [ ] Guard result logged (not silent skip)
- [ ] `npm run build` compiles without errors

## Risk Assessment

- **Over-aggressive skipping**: Maintainer-last heuristic may skip needed updates → only skip if second-to-last is also bot (confirms bot→maintainer→skip pattern)
- **API rate limits**: `gh api` calls for permissions → mitigated by caching per author
