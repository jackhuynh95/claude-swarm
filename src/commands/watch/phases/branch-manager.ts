import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GHIssue, IssueType } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Lowercase, replace non-alnum with dashes, collapse, truncate to 40 chars.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/**
 * Map issue type to branch prefix (conventional commit style).
 */
export function branchPrefix(issueType: IssueType): string {
  const map: Record<IssueType, string> = {
    bug: 'fix',
    feature: 'feat',
    docs: 'docs',
    chore: 'chore',
    unknown: 'feat',
  };
  return map[issueType];
}

/**
 * Create a feature branch from main.
 * Format: fix/issue-42-short-title or feat/issue-42-short-title
 */
export async function createBranch(
  issue: GHIssue,
  issueType: IssueType,
  cwd?: string,
): Promise<string> {
  const prefix = branchPrefix(issueType);
  const slug = slugify(issue.title);
  const branch = `${prefix}/issue-${issue.number}-${slug}`;
  const opts = { cwd: cwd ?? process.cwd() };

  // Pull latest main
  await execFileAsync('git', ['checkout', 'main'], opts);
  await execFileAsync('git', ['pull', '--ff-only'], opts);

  // Create or checkout branch
  try {
    await execFileAsync('git', ['checkout', '-b', branch], opts);
  } catch {
    // Branch exists — checkout and rebase
    await execFileAsync('git', ['checkout', branch], opts);
    await execFileAsync('git', ['rebase', 'main'], opts);
  }

  return branch;
}

/**
 * Stage all changes and commit with conventional format.
 * Returns false if no changes to commit.
 */
export async function commitChanges(
  issueNum: number,
  title: string,
  issueType: IssueType,
  cwd?: string,
): Promise<boolean> {
  const opts = { cwd: cwd ?? process.cwd() };
  const prefix = branchPrefix(issueType);

  // Check for changes
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], opts);
  if (!stdout.trim()) return false;

  await execFileAsync('git', ['add', '-A'], opts);
  const message = `${prefix}(#${issueNum}): ${title}\n\nRefs #${issueNum}`;
  await execFileAsync('git', ['commit', '-m', message], opts);
  return true;
}

/**
 * Push branch and create PR via gh CLI.
 * Returns PR URL or undefined on failure.
 */
export async function createPullRequest(
  repo: string,
  issueNum: number,
  title: string,
  issueType: IssueType,
  branch: string,
  cwd?: string,
): Promise<string | undefined> {
  const opts = { cwd: cwd ?? process.cwd() };
  const prefix = branchPrefix(issueType);
  const prTitle = `${prefix}(#${issueNum}): ${title}`;
  const prBody = [
    '## Summary',
    '',
    `Automated ${prefix} for #${issueNum}.`,
    '',
    `Closes #${issueNum}`,
  ].join('\n');

  try {
    await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], opts);
    const { stdout } = await execFileAsync('gh', [
      'pr', 'create',
      '--base', 'main',
      '--head', branch,
      '--title', prTitle,
      '--body', prBody,
      '-R', repo,
    ], opts);
    return stdout.trim();
  } catch {
    return undefined;
  }
}
