/**
 * Roadmap Parser — reads implement-roadmap-*.md files and extracts a
 * 4-layer hierarchy: milestone > epics > issues > sub-issues.
 *
 * Supports two formats:
 *   - phase-table: headings like `## Phase N —`
 *   - epic-table:  headings like `### Epic N —`
 */

import { readFileSync } from 'fs';
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

/** Detect whether the roadmap uses phase-level (h2) or epic-level (h3) headings. */
function detectFormat(content: string): 'phase' | 'epic' {
  const hasEpicHeadings = /^###\s+Epic\s+\d+/m.test(content);
  if (hasEpicHeadings) return 'epic';
  return 'phase'; // default
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a roadmap markdown file into a validated Roadmap structure.
 * Supports both phase-table and epic-table formats.
 */
export function parseRoadmap(filePath: string): Roadmap {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read roadmap file "${filePath}": ${(err as Error).message}`);
  }

  const format = detectFormat(content);
  const milestone = parseMilestone(content);
  const epics = parseEpics(content, format);

  try {
    return RoadmapSchema.parse({ milestone, epics });
  } catch (err) {
    throw new Error(`Roadmap schema validation failed for "${filePath}": ${(err as Error).message}`);
  }
}
