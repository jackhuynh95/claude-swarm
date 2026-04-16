/**
 * Run recorder — write structured run summaries to Runs/ via shared note-writer.
 * Supports append for retries on the same issue within a day.
 * Best-effort — never throws, never blocks the pipeline.
 */

import { appendSection } from '../../sync/obsidian-note-writer.js';
import type { NotePayload } from '../../sync/obsidian-note-spec.js';
import type { ClassifiedIssue, PhaseResult } from '../types.js';
import type { VerifyVerdict } from './verifier.js';

export interface RunRecordConfig {
  vaultPath: string;
}

/**
 * Record a structured run summary to Runs/.
 * First call per issue-day creates the file; subsequent calls append retry sections.
 */
export async function recordRun(
  classified: ClassifiedIssue,
  config: RunRecordConfig,
  flowResults: PhaseResult[],
  postShipResults: PhaseResult[],
  verdict?: VerifyVerdict,
): Promise<void> {
  try {
    const { issue, issueType } = classified;
    const today = formatDate(new Date());
    const now = formatTime(new Date());
    const allResults = [...flowResults, ...postShipResults];
    const totalMs = allResults.reduce((sum, r) => sum + r.durationMs, 0);

    const prUrl = allResults
      .flatMap((r) => r.artifacts ?? [])
      .find((a) => a.includes('pull')) ?? 'none';

    const payload: NotePayload = {
      noteType: 'run-review',
      title: `Issue #${issue.number} — ${issue.title}`,
      body: buildRunBody(issue, issueType, verdict, prUrl, totalMs, allResults),
      date: today,
      project: 'claude-swarm',
      sourcePhase: 'run-record',
      issue: issue.number,
      verdict: verdict ?? 'N/A',
      tags: ['run', 'claude-swarm'],
    };

    // appendSection handles both first-write and append-to-existing
    const retrySection = buildRetrySection(now, allResults, verdict);
    await appendSection(config.vaultPath, payload, retrySection);
  } catch {
    // Never block pipeline
  }
}

function buildRunBody(
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

  return `# Run: Issue #${issue.number} — ${issue.title}

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
