import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ClassifiedIssue, ExitReason, PhaseResult, TaskMetadata } from '../watch/types.js';

const DEFAULT_TASKS_PATH = '.ck-tasks.json';
const MAX_TASKS = 500;

interface TaskStore {
  version: 1;
  tasks: Record<string, TaskMetadata>;
}

/**
 * Persistent registry of task metadata for every issue processing run.
 * Atomic writes prevent corruption on crash. Never throws — best-effort.
 */
export class TaskRegistry {
  private readonly filePath: string;

  constructor(filePath = DEFAULT_TASKS_PATH) {
    this.filePath = filePath;
  }

  /** Begin tracking a new task run for the given classified issue. */
  startTask(classified: ClassifiedIssue): string {
    try {
      const id = `run-${classified.issue.number}-${Date.now()}`;
      const task: TaskMetadata = {
        id,
        issueNumber: classified.issue.number,
        issueTitle: classified.issue.title,
        role: classified.flowType,
        issueType: classified.issueType,
        state: classified.state,
        startedAt: new Date().toISOString(),
        phases: [],
        artifacts: [],
        resumable: false,
      };
      const store = this.loadStore();
      store.tasks[id] = task;
      this.pruneIfNeeded(store);
      this.saveStore(store);
      return id;
    } catch {
      return `run-${classified.issue.number}-${Date.now()}`;
    }
  }

  /** Append a phase result to an in-progress task. */
  recordPhase(taskId: string, result: PhaseResult): void {
    try {
      const store = this.loadStore();
      const task = store.tasks[taskId];
      if (!task) return;
      task.phases.push(result);
      if (result.artifacts) task.artifacts.push(...result.artifacts);
      this.saveStore(store);
    } catch { /* best-effort */ }
  }

  /** Mark a task as complete with an exit reason. */
  completeTask(taskId: string, exitReason: ExitReason, exitMessage?: string, costUsd?: number): void {
    try {
      const store = this.loadStore();
      const task = store.tasks[taskId];
      if (!task) return;
      task.endedAt = new Date().toISOString();
      task.exitReason = exitReason;
      task.exitMessage = exitMessage;
      task.costUsd = costUsd;
      // Resumable if failed non-permanently
      task.resumable = exitReason === 'error' || exitReason === 'timeout' || exitReason === 'needs_refix';
      task.state = exitReason === 'completed' ? 'completed' : exitReason === 'needs_refix' ? 'needs_refix' : 'error';
      this.saveStore(store);
    } catch { /* best-effort */ }
  }

  getTask(taskId: string): TaskMetadata | undefined {
    try {
      return this.loadStore().tasks[taskId];
    } catch {
      return undefined;
    }
  }

  /** Get the most recent active (no endedAt) task for an issue. */
  getActiveTask(issueNum: number): TaskMetadata | undefined {
    try {
      const tasks = Object.values(this.loadStore().tasks);
      return tasks
        .filter((t) => t.issueNumber === issueNum && !t.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    } catch {
      return undefined;
    }
  }

  /** List tasks with optional filters. Returns newest first. */
  listTasks(filter?: { issueNumber?: number; date?: string; state?: string }): TaskMetadata[] {
    try {
      let tasks = Object.values(this.loadStore().tasks);
      if (filter?.issueNumber !== undefined) {
        tasks = tasks.filter((t) => t.issueNumber === filter.issueNumber);
      }
      if (filter?.date) {
        tasks = tasks.filter((t) => t.startedAt.startsWith(filter.date!));
      }
      if (filter?.state) {
        tasks = tasks.filter((t) => t.state === filter.state);
      }
      return tasks.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    } catch {
      return [];
    }
  }

  /** Tasks eligible for retry (error / timeout / needs_refix). */
  getResumableTasks(): TaskMetadata[] {
    try {
      return Object.values(this.loadStore().tasks)
        .filter((t) => t.resumable)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    } catch {
      return [];
    }
  }

  private loadStore(): TaskStore {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as TaskStore;
    } catch {
      return { version: 1, tasks: {} };
    }
  }

  private saveStore(store: TaskStore): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  /** Keep store bounded to MAX_TASKS by dropping oldest completed tasks. */
  private pruneIfNeeded(store: TaskStore): void {
    const all = Object.entries(store.tasks).sort(([, a], [, b]) =>
      b.startedAt.localeCompare(a.startedAt),
    );
    if (all.length <= MAX_TASKS) return;
    // Remove oldest completed tasks first
    const toRemove = all
      .filter(([, t]) => t.exitReason === 'completed' && !t.resumable)
      .slice(MAX_TASKS);
    for (const [id] of toRemove) delete store.tasks[id];
  }
}

export function createTaskRegistry(cwd?: string): TaskRegistry {
  const filePath = cwd ? join(cwd, DEFAULT_TASKS_PATH) : DEFAULT_TASKS_PATH;
  return new TaskRegistry(filePath);
}
