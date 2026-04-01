import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ClaudeModel, PhaseType, PhaseResult } from '../types.js';

interface CostRate {
  input: number;   // USD per 1K tokens
  output: number;  // USD per 1K tokens
}

const COST_PER_1K_TOKENS: Record<ClaudeModel, CostRate> = {
  opus:   { input: 0.015, output: 0.075 },
  sonnet: { input: 0.003, output: 0.015 },
  haiku:  { input: 0.00025, output: 0.00125 },
};

interface RunEntry {
  issue: number;
  phase: PhaseType;
  model: ClaudeModel;
  tokens: number;
  costUsd: number;
  ts: string;
}

interface DailyBucket {
  runs: RunEntry[];
  totalUsd: number;
}

interface CostState {
  [date: string]: DailyBucket;
}

export interface CostSummary {
  date: string;
  totalUsd: number;
  runCount: number;
  topIssues: Array<{ issue: number; costUsd: number }>;
}

const DEFAULT_COST_PATH = '.ck-costs.json';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function loadState(filePath: string): CostState {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as CostState;
  } catch {
    return {};
  }
}

function saveState(state: CostState, filePath: string): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, filePath);
}

/**
 * Record the estimated cost of a Claude invocation for a given issue+phase.
 */
export function recordRunCost(
  issueNum: number,
  phase: PhaseType,
  model: ClaudeModel,
  result: PhaseResult,
  filePath = DEFAULT_COST_PATH,
): void {
  const state = loadState(filePath);
  const date = today();
  const bucket: DailyBucket = state[date] ?? { runs: [], totalUsd: 0 };

  const outputTokens = estimateTokens(result.output ?? '');
  // Estimate input ~2x output (rough heuristic when no prompt length available)
  const inputTokens = outputTokens * 2;
  const rate = COST_PER_1K_TOKENS[model];
  const costUsd = (inputTokens * rate.input + outputTokens * rate.output) / 1000;

  bucket.runs.push({ issue: issueNum, phase, model, tokens: outputTokens, costUsd, ts: new Date().toISOString() });
  bucket.totalUsd = Number((bucket.totalUsd + costUsd).toFixed(6));
  state[date] = bucket;

  saveState(state, filePath);
}

/**
 * Return aggregated cost summary for a given date (default: today).
 */
export function getDailySummary(date?: string, filePath = DEFAULT_COST_PATH): CostSummary {
  const state = loadState(filePath);
  const key = date ?? today();
  const bucket = state[key] ?? { runs: [], totalUsd: 0 };

  // Aggregate cost per issue
  const issueMap = new Map<number, number>();
  for (const run of bucket.runs) {
    issueMap.set(run.issue, (issueMap.get(run.issue) ?? 0) + run.costUsd);
  }
  const topIssues = [...issueMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue, costUsd]) => ({ issue, costUsd: Number(costUsd.toFixed(4)) }));

  return {
    date: key,
    totalUsd: Number(bucket.totalUsd.toFixed(4)),
    runCount: bucket.runs.length,
    topIssues,
  };
}

/**
 * Generate a nightly cost report as markdown.
 */
export function generateNightlyReport(date?: string, filePath = DEFAULT_COST_PATH): string {
  const summary = getDailySummary(date, filePath);
  const topLine = summary.topIssues
    .map((t) => `#${t.issue} ($${t.costUsd})`)
    .join(', ') || 'none';

  return [
    `## Nightly Cost Summary — ${summary.date}`,
    `- Total runs: ${summary.runCount}`,
    `- Estimated cost: $${summary.totalUsd}`,
    `- Top issues: ${topLine}`,
  ].join('\n');
}

export function getCostFilePath(cwd?: string): string {
  return cwd ? join(cwd, DEFAULT_COST_PATH) : DEFAULT_COST_PATH;
}
