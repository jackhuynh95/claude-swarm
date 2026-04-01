import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Predefined label transitions used by both flows
export const TRANSITIONS = {
  startWork:    { remove: 'ready_for_dev', add: undefined },
  shipped:      { remove: 'ready_for_dev', add: 'shipped' },
  readyForTest: { remove: 'ready_for_dev', add: 'ready_for_test' },
  verified:     { remove: 'shipped',       add: 'verified' },
  error:        { remove: undefined,       add: 'error' },
  needsRefix:   { remove: 'shipped',       add: 'needs_refix' },
  needsClarify: { remove: undefined,       add: 'needs-clarification' },
  clarified:    { remove: 'needs-clarification', add: undefined },
} as const;

/**
 * Transition labels on an issue: remove old, add new.
 * Retries propagation check up to 3 times (2s apart).
 * Uses execFile (no shell) to prevent injection.
 */
export async function transitionLabel(
  repo: string,
  issueNum: number,
  remove?: string,
  add?: string,
): Promise<boolean> {
  try {
    if (remove) {
      await execFileAsync('gh', [
        'issue', 'edit', String(issueNum),
        '--remove-label', remove,
        '-R', repo,
      ]);
    }
    if (add) {
      await execFileAsync('gh', [
        'issue', 'edit', String(issueNum),
        '--add-label', add,
        '-R', repo,
      ]);
    }
  } catch {
    return false;
  }

  // Propagation check: verify label applied (3 attempts, 2s apart)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await execFileAsync('gh', [
        'issue', 'view', String(issueNum),
        '--json', 'labels',
        '-R', repo,
      ]);
      const data = JSON.parse(stdout) as { labels: Array<{ name: string }> };
      const names = data.labels.map((l) => l.name);

      const removeOk = !remove || !names.includes(remove);
      const addOk = !add || names.includes(add);
      if (removeOk && addOk) return true;
    } catch {
      // ignore check failure, retry
    }
    if (attempt < 2) await sleep(2_000);
  }
  return false;
}

/**
 * Create a label if it doesn't already exist.
 */
export async function ensureLabelExists(
  repo: string,
  label: string,
  description: string,
  color: string,
): Promise<void> {
  try {
    await execFileAsync('gh', [
      'label', 'create', label,
      '--description', description,
      '--color', color,
      '-R', repo,
      '--force',
    ]);
  } catch {
    // label may already exist — safe to ignore
  }
}

/**
 * Post a comment on a GitHub issue.
 */
export async function addComment(
  repo: string,
  issueNum: number,
  body: string,
): Promise<boolean> {
  try {
    await execFileAsync('gh', [
      'issue', 'comment', String(issueNum),
      '--body', body,
      '-R', repo,
    ]);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
