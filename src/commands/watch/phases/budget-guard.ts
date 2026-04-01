import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { BudgetConfig, PhaseResult } from '../types.js';

interface IssueUsage {
  invocations: number;
  estimatedTokens: number;
  lastUpdated: string;
}

interface BudgetState {
  issues: Record<string, IssueUsage>;
}

const DEFAULT_BUDGET_PATH = '.ck-budget.json';

/**
 * Guards per-issue token and invocation budgets for unattended runs.
 * State persisted to disk so it survives process restarts.
 */
export class BudgetGuard {
  private readonly config: BudgetConfig;
  private readonly filePath: string;

  constructor(config: BudgetConfig, filePath = DEFAULT_BUDGET_PATH) {
    this.config = config;
    this.filePath = filePath;
  }

  checkBudget(issueNum: number): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) return { allowed: true };

    const state = this.loadState();
    const usage = state.issues[String(issueNum)];

    if (!usage) return { allowed: true };

    if (usage.invocations >= this.config.maxInvocationsPerIssue) {
      return { allowed: false, reason: `invocation limit (${usage.invocations}/${this.config.maxInvocationsPerIssue})` };
    }
    if (usage.estimatedTokens >= this.config.maxTokensPerIssue) {
      return { allowed: false, reason: `token limit (~${usage.estimatedTokens}/${this.config.maxTokensPerIssue} estimated tokens)` };
    }
    return { allowed: true };
  }

  recordInvocation(issueNum: number, result: PhaseResult): void {
    if (!this.config.enabled) return;

    const state = this.loadState();
    const key = String(issueNum);
    const existing = state.issues[key] ?? { invocations: 0, estimatedTokens: 0, lastUpdated: '' };

    state.issues[key] = {
      invocations: existing.invocations + 1,
      estimatedTokens: existing.estimatedTokens + this.estimateTokens(result.output ?? ''),
      lastUpdated: new Date().toISOString(),
    };

    this.saveState(state);
  }

  getUsage(issueNum: number): IssueUsage {
    const state = this.loadState();
    return state.issues[String(issueNum)] ?? { invocations: 0, estimatedTokens: 0, lastUpdated: '' };
  }

  resetIssue(issueNum: number): void {
    const state = this.loadState();
    delete state.issues[String(issueNum)];
    this.saveState(state);
  }

  private estimateTokens(output: string): number {
    return Math.ceil(output.length / 4);
  }

  private loadState(): BudgetState {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as BudgetState;
    } catch {
      return { issues: {} };
    }
  }

  private saveState(state: BudgetState): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }
}

export function createDefaultBudgetGuard(cwd?: string): BudgetGuard {
  const filePath = cwd ? join(cwd, DEFAULT_BUDGET_PATH) : DEFAULT_BUDGET_PATH;
  return new BudgetGuard(
    { maxInvocationsPerIssue: 20, maxTokensPerIssue: 500_000, enabled: true },
    filePath,
  );
}
