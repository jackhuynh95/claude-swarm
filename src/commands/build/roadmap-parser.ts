/**
 * Roadmap Parser — reads implement-roadmap-*.md, plan.md, or phase-*.md files
 * and extracts a hierarchy: milestone > epics > issues > sub-issues.
 *
 * Supports four formats:
 *   - phase-table: headings like `## Phase N —` (roadmap docs)
 *   - epic-table:  headings like `### Epic N —`
 *   - plan-table:  `## Phases` with `[title](phase-*.md)` links (plan.md wrapper)
 *   - phase-file:  a single `phase-*.md` file — treated as one runnable epic
 *                  with inner tasks from a task table, a todo-like checklist
 *                  section (Todo/Tasks/Checklist/To-Do…), a global checkbox
 *                  scan, or a synthesized single task from the phase title.
 */

import { readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { z } from 'zod';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const SubIssueSchema = z.string();

const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['feature', 'bug', 'docs', 'chore', 'unknown']).default('feature'),
  status: z.string().default('Pending'),
  subs: z.array(SubIssueSchema).default([]),
});

const EpicSchema = z.object({
  title: z.string(),
  issues: z.array(IssueSchema),
});

const RoadmapSchema = z.object({
  milestone: z.string(),
  epics: z.array(EpicSchema),
});

export type SubIssue = z.infer<typeof SubIssueSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;

// ─── Format Detection ─────────────────────────────────────────────────────────

/**
 * Detect format:
 * - 'epic':       `### Epic N —` headings
 * - 'plan':       `## Phases` (singular) with linked phase-*.md files (plan.md wrapper)
 * - 'phase-file': single `phase-*.md` file (filename-based detection)
 * - 'phase':      `## Phase N —` headings (roadmap macro)
 *
 * Check order matters: epic > plan > phase-file > phase. Plan.md is detected
 * before phase-file so a `phase-NN` slug in a plan.md dir doesn't misfire.
 */
function detectFormat(content: string, filePath: string): 'phase' | 'epic' | 'plan' | 'phase-file' {
  const hasEpicHeadings = /^###\s+Epic\s+\d+/m.test(content);
  if (hasEpicHeadings) return 'epic';

  // plan.md wrapper: `## Phases` with markdown links to phase-*.md files
  const hasPhasesTable = /^##\s+Phases?\s*$/m.test(content) && /\]\(phase-\d+/m.test(content);
  if (hasPhasesTable) return 'plan';

  // Single phase file: filename matches `phase-\d+...\.md`
  const fileName = basename(filePath);
  if (/^phase-\d+[^/\\]*\.md$/i.test(fileName)) return 'phase-file';

  const hasPhaseHeadings = /^##\s+Phase\s+\d+/m.test(content);
  if (hasPhaseHeadings) return 'phase';

  return 'phase';
}

// ─── Milestone Parsing ────────────────────────────────────────────────────────

/** Extract milestone title from the first `# Title` heading. */
function parseMilestone(content: string): string {
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();

  // Fallback: look for `## Milestone:` pattern
  const milestoneMatch = content.match(/^##\s+Milestone:\s*(.+)/m);
  if (milestoneMatch) return milestoneMatch[1].trim();

  return 'Unknown Milestone';
}

// ─── Issue Type Detection ─────────────────────────────────────────────────────

/** Infer issue type from title keywords. */
function detectType(title: string): Issue['type'] {
  const upper = title.toUpperCase();
  if (upper.includes('[BUG]') || /\bFIX\b/.test(upper) || upper.includes('BUGFIX')) return 'bug';
  if (upper.includes('[DOCS]') || upper.includes('DOCUMENT') || upper.includes('README')) return 'docs';
  if (upper.includes('[CHORE]') || upper.includes('REFACTOR') || upper.includes('CLEANUP')) return 'chore';
  return 'feature';
}

// ─── Table Parsing ────────────────────────────────────────────────────────────

/**
 * Detect if a table is a task table (has numeric IDs + task/status columns)
 * vs a non-task table (component catalog, summary, benefits comparison, etc.)
 *
 * Heuristics:
 * - Header row should contain task-related terms (#, Task, Status, etc.)
 * - Data rows should have numeric IDs
 * - At least 3 columns (id, title, status)
 */
function isTaskTable(tableBlock: string): boolean {
  const lines = tableBlock
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|'));

  if (lines.length < 3) return false; // need header + separator + at least 1 row

  // Check header row for task-like column names
  const headerCells = lines[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const hasTaskHeader = headerCells.some(c =>
    /^(task|description|action|item)$/i.test(c)
  );
  const hasStatusHeader = headerCells.some(c =>
    /^(status|state|done|progress)$/i.test(c)
  );
  const hasIdHeader = headerCells.some(c =>
    /^(#|no\.?|id|num)$/i.test(c)
  );

  // Reject summary tables: first column is "phase", "step", "before", "component" etc.
  const firstHeader = headerCells[0] ?? '';
  if (/^(phase|step|before|after|component|layer|capability|what)$/i.test(firstHeader)) return false;

  // Strong signal: has both task-like and status-like headers with ID column
  if (hasIdHeader && hasTaskHeader && hasStatusHeader) return true;

  // Fallback: check data rows for numeric IDs (but require task+status header pattern)
  if (!hasTaskHeader && !hasStatusHeader) return false;

  let numericIdCount = 0;
  let dataRowCount = 0;

  for (const line of lines) {
    if (/^\|[-:| ]+\|$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (/^#$|^no\.?$/i.test(cells[0] ?? '')) continue;

    dataRowCount++;
    if (/^\d+$/.test(cells[0] ?? '')) numericIdCount++;
  }

  return dataRowCount > 0 && numericIdCount / dataRowCount > 0.5;
}

/**
 * Parse a markdown table block into issues + sub-issues.
 * Sub-issues: rows where the first column (id) is empty or whitespace-only.
 * Only parses tables with numeric IDs (task tables).
 */
function parseTable(tableBlock: string): Issue[] {
  if (!isTaskTable(tableBlock)) return [];

  const lines = tableBlock
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|'));

  const issues: Issue[] = [];
  let current: Issue | null = null;

  // Track raw subs separately to avoid mutating Zod-validated objects
  const rawSubsMap = new Map<number, string[]>();

  for (const line of lines) {
    // Skip separator rows (e.g., |---|---|---|)
    if (/^\|[-:| ]+\|$/.test(line)) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());

    if (cells.length < 2) continue;

    // Skip header rows where id cell is '#' or 'no.'
    if (/^#$|^no\.?$/i.test(cells[0] ?? '')) continue;

    const [idCell, titleCell, statusCell] = cells;
    const title = titleCell ?? '';

    // Only accept rows with numeric IDs as issues
    if (!idCell || !/^\d+$/.test(idCell)) {
      // Non-numeric id = sub-issue of current parent (if whitespace/empty)
      if ((!idCell || /^\s*$/.test(idCell)) && current !== null && title) {
        const subs = rawSubsMap.get(issues.length - 1) ?? [];
        subs.push(title);
        rawSubsMap.set(issues.length - 1, subs);
      }
      continue;
    }

    // New issue row — parse without subs first, attach after collecting all rows
    current = IssueSchema.parse({
      id: idCell,
      title,
      type: detectType(title),
      status: statusCell ?? 'Pending',
      subs: [],
    });
    issues.push(current);
  }

  // Attach collected sub-issues (avoids mutating Zod-returned objects mid-loop)
  for (const [idx, subs] of rawSubsMap) {
    issues[idx] = { ...issues[idx], subs };
  }

  return issues;
}

// ─── Epic Parsing ─────────────────────────────────────────────────────────────

/**
 * Split content on epic headings and parse each section's table(s).
 * - phase format: `## Phase N …`
 * - epic format:  `### Epic N …`
 */
function parseEpics(content: string, format: 'phase' | 'epic'): Epic[] {
  const headingPattern = format === 'epic'
    ? /^###\s+Epic\s+\d+/m
    : /^##\s+Phase\s+\d+/m;

  // Split on the heading pattern, keeping delimiters
  const headingRegex = format === 'epic'
    ? /(?=^###\s+Epic\s+\d+)/gm
    : /(?=^##\s+Phase\s+\d+)/gm;

  const sections = content.split(headingRegex).filter(s => headingPattern.test(s));

  return sections.map(section => {
    const lines = section.split('\n');
    const title = lines[0].replace(/^#{2,3}\s+/, '').trim();

    // Strip code fences (```...```) to avoid parsing inline tables in code blocks
    const stripped = section.replace(/```[\s\S]*?```/g, '');

    // Extract all table blocks within this section
    const tablePattern = /(\|.+\n)+/g;
    const tableMatches = stripped.match(tablePattern) ?? [];
    const issues = tableMatches.flatMap(t => parseTable(t));

    return EpicSchema.parse({ title, issues });
  }).filter(e => e.issues.length > 0);
}

// ─── Plan.md Parsing (1 plan = 1 phase of roadmap) ───────────────────────────

/**
 * Parse a plan.md file: extract phase-*.md links from the Phases table.
 * Each linked file becomes a task. The whole plan = 1 epic.
 */
function parsePlan(content: string, planDir: string): Epic[] {
  // Find markdown links to phase files: [Title](phase-01-name.md)
  const linkRe = /\[([^\]]+)\]\((phase-\d+[^)]*\.md)\)/g;
  const issues: Issue[] = [];
  let id = 1;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(content)) !== null) {
    const title = m[1].trim();
    const phaseFile = m[2];
    const phaseFilePath = join(planDir, phaseFile);

    // Read phase file to extract sub-tasks (### Step N headings or checklist items)
    const subs: string[] = [];
    try {
      const phaseContent = readFileSync(phaseFilePath, 'utf-8');
      const stepRe = /^###\s+(?:Step\s+\d+[.:]\s*)?(.+)/gm;
      let s: RegExpExecArray | null;
      while ((s = stepRe.exec(phaseContent)) !== null) {
        subs.push(s[1].trim());
      }
    } catch {
      // Phase file not found — still add the task, just no subs
    }

    issues.push(IssueSchema.parse({
      id: String(id++),
      title,
      type: detectType(title),
      status: 'Pending',
      subs,
    }));
  }

  if (issues.length === 0) return [];

  const milestone = parseMilestone(content);
  return [EpicSchema.parse({ title: milestone, issues })];
}

// ─── Phase-file Parsing (single phase-*.md as a runnable epic) ───────────────

/**
 * Extract the body of a top-level `## <name>` section. Returns null if not found.
 * Reads until the next `^## ` heading or end-of-file.
 */
function extractH2Section(content: string, name: string): string | null {
  const lines = content.split('\n');
  const startRe = new RegExp(`^##\\s+${name}\\s*$`, 'i');
  let inside = false;
  const body: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inside) break;
      if (startRe.test(line)) { inside = true; continue; }
    }
    if (inside) body.push(line);
  }
  return inside ? body.join('\n') : null;
}

/**
 * Extract top-level checklist items from a text body as Issues.
 * Accepts `-`, `*`, `+` markers with up to 4 spaces/tabs of indent so that
 * slight formatting variations in hand-written phase files still parse.
 * Only lines whose marker is the FIRST non-whitespace content become tasks —
 * narrative bullets that happen to contain `[x]` later in the line are skipped.
 */
function extractChecklistIssues(body: string): Issue[] {
  const issues: Issue[] = [];
  const checklistRe = /^[ \t]{0,4}[-*+]\s+\[([ xX])\]\s+(.+)$/gm;
  let id = 1;
  let m: RegExpExecArray | null;
  while ((m = checklistRe.exec(body)) !== null) {
    const itemTitle = m[2].trim();
    if (!itemTitle) continue;
    const checked = m[1].toLowerCase() === 'x';
    issues.push(IssueSchema.parse({
      id: String(id++),
      title: itemTitle,
      type: detectType(itemTitle),
      status: checked ? 'Complete' : 'Pending',
      subs: [],
    }));
  }
  return issues;
}

/**
 * Parse a single phase-*.md file into one runnable epic.
 *
 * Task extraction priority (first match wins):
 *   1. Numeric task table (reuses parseTable's `isTaskTable` heuristic)
 *   2. Checklist items under a todo-like H2 section
 *      (`## Todo`, `## Todos`, `## Todo List`, `## Tasks`, `## Task List`,
 *      `## Checklist`, `## To-Do`)
 *   3. Global top-level checkbox scan (mirrors `build status --plan`)
 *   4. Synthesized single task from the phase's H1 title
 *
 * `--from-task N` filtering stays scoped to this phase file's tasks.
 */
function parsePhaseFile(content: string): Epic[] {
  const h1 = content.match(/^#\s+(.+)/m);
  const title = h1 ? h1[1].trim() : 'Phase';

  // Strip code fences to avoid parsing tables/checklists inside code samples
  const stripped = content.replace(/```[\s\S]*?```/g, '');

  // 1. Numeric task table
  const tableMatches = stripped.match(/(\|.+\n)+/g) ?? [];
  const tableIssues = tableMatches.flatMap(t => parseTable(t));
  if (tableIssues.length > 0) {
    return [EpicSchema.parse({ title, issues: tableIssues })];
  }

  // 2. Checklist items under a todo-like section heading.
  //    Accepts: Todo, Todos, Todo List, Task, Tasks, Task List, Checklist, To-Do.
  //    Item markers: `-`, `*`, or `+`, with up to 4 spaces/tabs of leading indent.
  //    Kept in sync with `build status --plan` global checkbox counting so
  //    status and run agree on task counts for phase files.
  const todoHeading = '(?:Todos?(?:\\s+List)?|Tasks?(?:\\s+List)?|Checklist|To-?Do)';
  const todoBody = extractH2Section(stripped, todoHeading);
  if (todoBody) {
    const issues = extractChecklistIssues(todoBody);
    if (issues.length > 0) {
      return [EpicSchema.parse({ title, issues })];
    }
  }

  // 3. Global fallback: scan the entire file for top-level checklist items.
  //    Matches `build status --plan` behavior so per-phase task counts agree
  //    between `status` and `run`. Triggers only when the narrower Todo section
  //    extraction found nothing (custom heading, missing section, etc.).
  const globalIssues = extractChecklistIssues(stripped);
  if (globalIssues.length > 0) {
    return [EpicSchema.parse({ title, issues: globalIssues })];
  }

  // 4. Synthesize single task from phase title
  const synth = IssueSchema.parse({
    id: '1',
    title,
    type: detectType(title),
    status: 'Pending',
    subs: [],
  });
  return [EpicSchema.parse({ title, issues: [synth] })];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a roadmap, plan.md, or phase-*.md file into a validated Roadmap.
 * Supports: phase-table (roadmap doc), epic-table, plan-table (plan.md wrapper),
 * and phase-file (single phase-*.md as one runnable epic).
 */
export function parseRoadmap(filePath: string): Roadmap {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read roadmap file "${filePath}": ${(err as Error).message}`);
  }

  const format = detectFormat(content, filePath);
  const milestone = parseMilestone(content);

  let epics: Epic[];
  if (format === 'plan') {
    epics = parsePlan(content, dirname(filePath));
  } else if (format === 'phase-file') {
    epics = parsePhaseFile(content);
  } else {
    epics = parseEpics(content, format);
  }

  try {
    return RoadmapSchema.parse({ milestone, epics });
  } catch (err) {
    throw new Error(`Roadmap schema validation failed for "${filePath}": ${(err as Error).message}`);
  }
}
