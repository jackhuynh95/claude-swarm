---
name: release
description: "Bump version, tag, push, create GitHub release, and notify uncle via Slack. Use when user says \"release\", \"new version\", \"bump version\", \"publish release\", \"ship version\", or wants to create a tagged GitHub release."
---

# Release Skill

Automate full release cycle: version bump, git tag, GitHub release, uncle notification.

## Invocation

- `/release` — interactive: ask version bump type
- `/release patch` — bump patch (0.4.0 → 0.4.1)
- `/release minor` — bump minor (0.4.0 → 0.5.0)
- `/release major` — bump major (0.4.0 → 1.0.0)
- `/release 1.2.3` — set explicit version
- `/release --dry-run` — show what would happen without executing

## Scope

This skill handles: version bumping, git tagging, GitHub releases, Slack notification.
Does NOT handle: npm publishing, CI/CD pipelines, deployment, changelog file generation.

## Workflow

### Step 1 — Determine Version

1. Read current version from `package.json`
2. Parse argument: `patch`, `minor`, `major`, or explicit semver
3. If no argument provided, use AskUserQuestion:
   - Options: patch, minor, major, or custom
4. Calculate new version

### Step 2 — Pre-flight Checks

1. Run `git status` — ensure working tree is clean (no uncommitted changes)
2. Run `git tag -l` — ensure new tag doesn't already exist
3. Run `gh release list --limit 5` — check no duplicate release
4. If dirty tree: warn user, ask to proceed or abort
5. If `--dry-run`: print summary and stop here

### Step 3 — Bump & Commit

1. Update `version` field in `package.json`
2. Commit: `git add package.json && git commit -m "chore(release): bump version to vX.Y.Z"`

### Step 4 — Tag & Push

1. Create tag: `git tag vX.Y.Z`
2. Push: `git push origin <current-branch> --tags`
3. If push fails on stale tags, retry with just: `git push origin <current-branch> && git push origin vX.Y.Z`

### Step 5 — GitHub Release

1. Collect commits since last tag: `git log <prev-tag>..HEAD --oneline --no-merges`
2. Group commits by type (feat, fix, refactor, etc.)
3. Create release:

```
gh release create vX.Y.Z --title "vX.Y.Z" --notes "$NOTES" --latest
```

Note: use `--notes` flag (not `--body`).

### Step 6 — Uncle Notification (Optional)

Ask user: "Send uncle report about this release?"
If yes, activate `/uncle-report` skill with release context.

## Release Notes Format

```
## What's New

### Features
- **description** from feat: commits

### Fixes
- **description** from fix: commits

### Other
- remaining commits
```

Omit empty sections. Keep concise.

## Error Recovery

- If commit fails: check pre-commit hooks, fix, retry
- If tag exists: ask user to delete old tag or pick different version
- If push fails: check remote access, suggest `git pull --rebase` if behind
- If `gh release create` fails on flag: use `--notes` not `--body`

## Security Policy

- Never commit `.env`, credentials, or secrets during release
- Never force-push tags
- Verify `package.json` only changes version field
