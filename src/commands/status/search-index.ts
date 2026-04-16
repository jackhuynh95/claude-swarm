import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { TaskRegistry } from './task-registry.js';

export interface SearchResult {
  type: 'plan' | 'run' | 'review';
  path: string;         // human-readable path or task id
  title: string;        // file name or issue title
  snippet: string;      // matched context (±1 line)
}

/** Recursively collect .md files under a directory. */
function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

/** Extract a context snippet around the first match in text (±1 line). */
function extractSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return '';
  const lines = text.split('\n');
  let charCount = 0;
  let matchLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= idx) { matchLine = i; break; }
    charCount += lines[i].length + 1;
  }
  if (matchLine === -1) return '';
  const start = Math.max(0, matchLine - 1);
  const end = Math.min(lines.length - 1, matchLine + 1);
  return lines.slice(start, end + 1).map((l) => `  ${l.trim()}`).join('\n');
}

/** Search markdown plan files under plansDir. */
export function searchPlans(query: string, plansDir: string): SearchResult[] {
  if (!existsSync(plansDir)) return [];
  const files = collectMdFiles(plansDir);
  const results: SearchResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      if (!content.toLowerCase().includes(query.toLowerCase())) continue;
      const snippet = extractSnippet(content, query);
      results.push({
        type: 'plan',
        path: relative(process.cwd(), file),
        title: file.split('/').pop() ?? file,
        snippet,
      });
    } catch { /* skip unreadable */ }
    if (results.length >= 3) break;
  }
  return results;
}

/** Search TaskRegistry run records by issue title or exit message. */
export function searchRuns(query: string, registry: TaskRegistry): SearchResult[] {
  const lq = query.toLowerCase();
  const tasks = registry.listTasks();
  const results: SearchResult[] = [];

  for (const task of tasks) {
    const haystack = `${task.issueTitle} ${task.exitMessage ?? ''}`.toLowerCase();
    if (!haystack.includes(lq)) continue;
    results.push({
      type: 'run',
      path: `.ck-tasks.json → ${task.id}`,
      title: `Issue #${task.issueNumber}: "${task.issueTitle}"`,
      snippet: `  ${task.exitReason ?? task.state}${task.exitMessage ? ` — ${task.exitMessage}` : ''}`,
    });
    if (results.length >= 3) break;
  }
  return results;
}

/** Search markdown review files in the obsidian vault. */
export function searchReviews(query: string, vaultPath: string): SearchResult[] {
  const reviewDir = join(vaultPath, 'Runs');
  if (!existsSync(reviewDir)) return [];
  const files = collectMdFiles(reviewDir);
  const results: SearchResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      if (!content.toLowerCase().includes(query.toLowerCase())) continue;
      const snippet = extractSnippet(content, query);
      results.push({
        type: 'review',
        path: relative(process.cwd(), file),
        title: file.split('/').pop() ?? file,
        snippet,
      });
    } catch { /* skip unreadable */ }
    if (results.length >= 3) break;
  }
  return results;
}

export interface SearchAllConfig {
  plansDir: string;
  vaultPath: string;
  registry: TaskRegistry;
}

/** Aggregate results from plans, runs, and reviews. */
export function searchAll(query: string, config: SearchAllConfig): {
  plans: SearchResult[];
  runs: SearchResult[];
  reviews: SearchResult[];
} {
  return {
    plans:   searchPlans(query, config.plansDir),
    runs:    searchRuns(query, config.registry),
    reviews: searchReviews(query, config.vaultPath),
  };
}
