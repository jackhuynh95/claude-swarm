# Phase 03: Branch Manager

**Priority**: High (used by both flows for commit + PR)
**Status**: Complete

---

## Overview

Extract branch setup, commit, and PR creation into a shared module. Both flows create feature branches, commit changes, push, and create PRs via `gh`. Ported from `step_1_branch()`, `step_4_commit()`, `step_5_pr()` in both scripts.

## Context Links

- Source: `auto-claude/fix-issue.sh` lines 276-322 (branch), 525-543 (commit), 546-578 (PR)
- Source: `auto-claude/ship-issue.sh` lines 251-297 (branch), 390-412 (commit), 414-452 (PR)
- Types: `src/commands/watch/types.ts` (GHIssue, IssueType)

## Architecture

```
createBranch(issue, issueType)
  ├── Slugify title → fix/issue-42-short-title or feat/issue-42-short-title
  ├── git checkout main && git pull --ff-only
  ├── git checkout -b <branch>
  └── Return branch name

commitChanges(issueNum, issueTitle, issueType)
  ├── git status --porcelain (skip if empty)
  ├── git add -A
  └── git commit -m "fix(#42): title" or "feat(#42): title"

createPullRequest(repo, issueNum, issueTitle, issueType, branch)
  ├── git push -u origin HEAD
  ├── gh pr create --base main --title --body
  └── Return PR URL
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/branch-manager.ts`

## Implementation Steps

1. Create `branch-manager.ts` with:
   - `slugify(title: string): string` — lowercase, replace non-alnum with `-`, collapse dashes, truncate to 40 chars
   - `branchPrefix(issueType: IssueType): string` — bug -> `fix`, feature -> `feat`, docs -> `docs`, chore -> `chore`, unknown -> `feat`

2. Implement `createBranch(issue, issueType)`:
   - `git checkout main && git pull --ff-only`
   - Branch name: `${prefix}/issue-${num}-${slug}`
   - `git checkout -b <branch>` (if exists, checkout + rebase main)
   - Return branch name string

3. Implement `commitChanges(issueNum, title, issueType)`:
   - Check `git status --porcelain` — return false if no changes
   - `git add -A`
   - Commit message: `${prefix}(#${num}): ${title}\n\nRefs #${num}`
   - Return boolean success

4. Implement `createPullRequest(repo, issueNum, title, issueType, branch)`:
   - `git push -u origin HEAD`
   - `gh pr create --base main --title "${prefix}(#${num}): ${title}" --body "..."`
   - PR body: Summary, `Closes #${num}`, diff stats
   - Return PR URL string

5. All git/gh operations via `execFile` for safety.

## Todo

- [x] Create `branch-manager.ts`
- [x] Implement slugify + branchPrefix
- [x] Implement createBranch
- [x] Implement commitChanges
- [x] Implement createPullRequest
- [x] Verify `npm run build` compiles

## Success Criteria

- [x] Creates correctly named branches (fix/issue-42-slug, feat/issue-42-slug)
- [x] Commits with conventional commit format
- [x] Creates PRs with proper body referencing the issue
- [x] Handles "branch already exists" gracefully

## Implementation Notes

- Module exports `createBranch()`, `commitChanges()`, and `createPullRequest()`
- Branch naming follows conventional format with issue number and slug
- Commits use conventional commit format (fix/feat/docs/chore)
- All git/gh operations use `execFile` for safety
