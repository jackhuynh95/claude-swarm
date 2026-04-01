import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import type { VerifyVerdict } from './verifier.js';

const RUNS_DIR = 'Review/Runs';

export interface RunRecordConfig {
  vaultPath: string;
}

/**
 * Record a structured run summary to obsidian-vault/Review/Runs/.
 * Best-effort — never throws, never blocks the pipeline.
 */
export async function recordRun(
  classified: ClassifiedIssue,
  config: RunRecordConfig,
  flowResults: PhaseResult[],
  postShipResults: PhaseResult[],
  verdict?: VerifyVerdict,
): Promise<void> {
  try {
    const runsDir = join(config.vaultPath, RUNS_DIR);
    await mkdir(runsDir, { recursive: true });

    const { issue, issueType } = classified;
    const today = formatDate(new Date());
    const now = formatTime(new Date());
    const filePath = join(runsDir, `${today}-issue-${issue.number}.md`);

    const allResults = [...flowResults, ...postShipResults];
    const totalMs = allResults.reduce((sum, r) => sum + r.durationMs, 0);

    const prUrl = allResults
      .flatMap((r) => r.artifacts ?? [])
      .find((a) => a.includes('pull')) ?? 'none';

    let existing: string | null = null;
    try {
      existing = await readFile(filePath, 'utf8');
    } catch {
      // file doesn't exist yet — first run for this issue today
    }

    if (existing) {
      // Append retry section
      const retrySection = buildRetrySection(now, allResults, verdict);
      await writeFile(filePath, existing + retrySection, 'utf8');
    } else {
      // New file: frontmatter + full run body
      const content = buildRunFile(today, issue, issueType, verdict, prUrl, totalMs, allResults);
      await writeFile(filePath, content, 'utf8');
    }
  } catch {
    // Never block pipeline
  }
}

function buildRunFile(
  date: string,
  issue: ClassifiedIssue['issue'],
  issueType: string,
  verdict: VerifyVerdict | undefined,
  prUrl: string,
  totalMs: number,
  allResults: PhaseResult[],
): string {
  const phaseRows = allResults
    .map((r) => `| ${r.phase} | ${r.success ? 'ok' : 'fail'} | ${formatDuration(r.durationMs)} | ${r.error ?? '—'} |`)
    .join('\n');

  const errors = allResults
    .filter((r) => !r.success && r.error)
    .map((r) => `- **${r.phase}**: ${r.error}`)
    .join('\n') || 'None';

  return `---
date: ${date}
issue: ${issue.number}
type: ${issueType}
verdict: ${verdict ?? 'N/A'}
tags: [run, claude-swarm]
---

# Run: Issue #${issue.number} — ${issue.title}

| Field | Value |
|-------|-------|
| Type | ${issueType} |
| Verdict | ${verdict ?? 'N/A'} |
| Total Duration | ${formatDuration(totalMs)} |
| PR | ${prUrl} |

## Phase Results

| Phase | Status | Duration | Error |
|-------|--------|----------|-------|
${phaseRows}

## Errors

${errors}
`;
}

function buildRetrySection(now: string, allResults: PhaseResult[], verdict: VerifyVerdict | undefined): string {
  const phaseRows = allResults
    .map((r) => `| ${r.phase} | ${r.success ? 'ok' : 'fail'} | ${formatDuration(r.durationMs)} | ${r.error ?? '—'} |`)
    .join('\n');

  const totalMs = allResults.reduce((sum, r) => sum + r.durationMs, 0);

  return `
## Retry — ${now}

| Field | Value |
|-------|-------|
| Verdict | ${verdict ?? 'N/A'} |
| Total Duration | ${formatDuration(totalMs)} |

| Phase | Status | Duration | Error |
|-------|--------|----------|-------|
${phaseRows}
`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
