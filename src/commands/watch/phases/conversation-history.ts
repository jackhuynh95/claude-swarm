import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { PhaseType, PhaseResult } from '../types.js';

const MAX_OUTPUT_LEN = 10_000;
const DEFAULT_HISTORY_PATH = '.ck-history.json';

export interface PhaseEntry {
  phase: PhaseType;
  success: boolean;
  output?: string;
  error?: string;
  ts: string;
  durationMs: number;
}

interface IssueRecord {
  entries: PhaseEntry[];
  startedAt: string;
}

interface HistoryState {
  [issueNum: string]: IssueRecord;
}

/**
 * Persists per-issue phase outputs across process restarts.
 * Replaces the in-memory failureContext pattern in debug-flow.
 */
export class ConversationHistory {
  private readonly filePath: string;

  constructor(filePath = DEFAULT_HISTORY_PATH) {
    this.filePath = filePath;
  }

  recordPhaseOutput(issueNum: number, phase: PhaseType, result: PhaseResult, metadata?: Record<string, unknown>): void {
    const state = this.loadState();
    const key = String(issueNum);

    if (!state[key]) {
      state[key] = { entries: [], startedAt: new Date().toISOString() };
    }

    const entry: PhaseEntry = {
      phase,
      success: result.success,
      output: result.output?.slice(0, MAX_OUTPUT_LEN),
      error: result.error,
      ts: new Date().toISOString(),
      durationMs: result.durationMs,
      ...metadata,
    };

    state[key].entries.push(entry);
    this.saveState(state);
  }

  getIssueHistory(issueNum: number): PhaseEntry[] {
    const state = this.loadState();
    return state[String(issueNum)]?.entries ?? [];
  }

  getLastPhaseOutput(issueNum: number, phase?: PhaseType): PhaseEntry | undefined {
    const entries = this.getIssueHistory(issueNum);
    if (!phase) return entries[entries.length - 1];
    // Find last entry matching phase (search from end)
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].phase === phase) return entries[i];
    }
    return undefined;
  }

  clearIssueHistory(issueNum: number): void {
    const state = this.loadState();
    delete state[String(issueNum)];
    this.saveState(state);
  }

  private loadState(): HistoryState {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as HistoryState;
    } catch {
      return {};
    }
  }

  private saveState(state: HistoryState): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }
}

export function createHistory(cwd?: string): ConversationHistory {
  const filePath = cwd ? join(cwd, DEFAULT_HISTORY_PATH) : DEFAULT_HISTORY_PATH;
  return new ConversationHistory(filePath);
}
