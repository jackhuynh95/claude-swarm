/**
 * Plan Status — reads a plan.md file and renders per-phase progress.
 *
 * Extracts status from the ## Phases table in plan.md and todo counts
 * from each linked phase-NN-*.md file.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import chalk from 'chalk';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhaseEntry {
  phaseNum: string;
  title: string;
  filePath: string;
  tableStatus: string;   // status from plan.md Phases table
  fileStatus: string;    // status from phase file frontmatter
  todosDone: number;
  todosTotal: number;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse ## Phases table rows.
 * Handles variable column layouts — scans all cells for [title](phase-NN-*.md) links.
 * Status is taken from the rightmost non-link, non-file cell that looks like a status value.
 */
function parsePhasesTable(planContent: string, planDir: string): PhaseEntry[] {
  // Find the ## Phases section (up to next ## heading)
  const phasesMatch = planContent.match(/^##\s+Phases?\s*$([\s\S]*?)(?=^##\s|\Z)/m);
  if (!phasesMatch) return [];

  const tableSection = phasesMatch[1];
  const entries: PhaseEntry[] = [];
  let entryCount = 0;

  for (const line of tableSection.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|[-:| ]+\|$/.test(line.trim())) continue; // separator

    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;

    // Skip header rows
    if (cells.some(c => /^(phase|#|no\.?|file|status|title)$/i.test(c))) continue;

    // Find the cell containing a phase-NN link
    let linkTitle = '';
    let relFile = '';
    let phaseNum = '';
    const nonLinkCells: string[] = [];

    for (const cell of cells) {
      const m = cell.match(/\[([^\]]+)\]\((phase-\d+[^)]*\.md)\)/);
      if (m) {
        linkTitle = m[1].trim();
        relFile = m[2];
      } else {
        nonLinkCells.push(cell);
      }
    }

    if (!relFile) continue; // no phase link found in this row

    // Phase number: first non-link cell that is numeric or short (≤3 chars)
    const numCell = nonLinkCells.find(c => /^\d+$/.test(c) || /^\d{2}$/.test(c));
    phaseNum = numCell ?? String(++entryCount);

    // Status: last non-link, non-backtick cell (backtick cells are file paths)
    const statusCandidates = nonLinkCells.filter(c => !c.startsWith('`') && c !== phaseNum);
    const tableStatus = statusCandidates.at(-1) ?? 'unknown';

    entries.push({
      phaseNum,
      title: linkTitle,
      filePath: join(planDir, relFile),
      tableStatus,
      fileStatus: '',
      todosDone: 0,
      todosTotal: 0,
    });
  }

  return entries;
}

/** Read phase file: extract YAML frontmatter title/status + count todo checklist items. */
function readPhaseFile(filePath: string): { title: string; status: string; done: number; total: number } {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return { title: '', status: 'file-not-found', done: 0, total: 0 };
  }

  // YAML frontmatter: title and status fields
  const frontmatter = content.match(/^---([\s\S]*?)^---/m)?.[1] ?? '';
  const titleMatch = frontmatter.match(/^title:\s*"?(.+?)"?\s*$/m);
  const statusMatch = frontmatter.match(/^status:\s*(.+?)\s*$/m);

  const title = titleMatch ? titleMatch[1].trim() : '';
  const fileStatus = statusMatch ? statusMatch[1].trim() : '';

  // Count checklist items
  const allChecks = (content.match(/^- \[[ x]\]/gim) ?? []).length;
  const doneChecks = (content.match(/^- \[x\]/gim) ?? []).length;

  return { title, status: fileStatus, done: doneChecks, total: allChecks };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function progressBar(done: number, total: number, width = 20): string {
  if (total === 0) return chalk.dim('░'.repeat(width) + ' 0/0');
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  const pct = Math.round((done / total) * 100);
  const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `${bar} ${done}/${total} (${pct}%)`;
}

function statusBadge(raw: string): string {
  const lower = raw.replace(/^[^\w]+/, '').replace(/[-_\s]+/g, ' ').toLowerCase();
  if (/^(complete|completed|done|finished)/.test(lower)) return chalk.green(`[${raw}]`);
  if (/^(in progress|wip|active|running)/.test(lower)) return chalk.yellow(`[${raw}]`);
  if (/^(pending|not started|todo|queued)/.test(lower)) return chalk.dim(`[${raw}]`);
  if (/^(blocked|failed|error)/.test(lower)) return chalk.red(`[${raw}]`);
  if (/^(skipped|deferred|cancelled)/.test(lower)) return chalk.dim(`[${raw}]`);
  if (!raw || raw === 'unknown' || raw === 'file-not-found') return chalk.dim('[unknown]');
  return chalk.white(`[${raw}]`);
}

function isComplete(status: string): boolean {
  // Strip leading symbols (✓, ✅, *, etc.) before matching
  const clean = status.replace(/^[^\w]+/, '').replace(/[-_\s]+/g, ' ').toLowerCase();
  return /^(complete|completed|done|finished)/.test(clean);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Read plan.md at planPath and render per-phase status + todo progress. */
export function renderPlanStatus(planPath: string): void {
  let planContent: string;
  try {
    planContent = readFileSync(planPath, 'utf-8');
  } catch (err) {
    console.error(chalk.red(`Error: Cannot read plan file "${planPath}": ${(err as Error).message}`));
    process.exit(1);
  }

  const planDir = dirname(planPath);
  const planName = basename(planDir); // e.g. "260414-1705-g7-watcher-vault-completion-policy"

  // Extract plan title: YAML frontmatter title or first H1
  const yamlTitleMatch = planContent.match(/^---[\s\S]*?^title:\s*"?(.+?)"?\s*$/m);
  const h1Match = planContent.match(/^#\s+(.+)/m);
  const planTitle = yamlTitleMatch
    ? yamlTitleMatch[1].trim()
    : h1Match ? h1Match[1].replace(/^Plan:\s*/, '').trim() : planName;

  const phases = parsePhasesTable(planContent, planDir);

  if (phases.length === 0) {
    console.log(chalk.yellow(`  No phases found in plan: ${planPath}`));
    console.log(chalk.dim(`  Expected a "## Phases" table with [title](phase-NN-*.md) links`));
    return;
  }

  // Enrich each phase with file-level data
  for (const phase of phases) {
    const file = readPhaseFile(phase.filePath);
    // Override link-text title with YAML title if the link text looks like a filename
    if (file.title && /^phase-\d+/.test(phase.title)) {
      phase.title = file.title;
    }
    phase.fileStatus = file.status;
    phase.todosDone = file.done;
    phase.todosTotal = file.total;
  }

  // Derive label from actual todo progress when todos exist; otherwise fall back
  // to recorded status. This prevents a phase with unchecked todos (e.g. 8/10)
  // from being labeled `[Complete]` just because the plan.md table or YAML
  // frontmatter says so.
  //   total === 0              → recorded status (table, then file, then "unknown")
  //   done === total (>0)      → Complete
  //   done === 0, total > 0    → Pending
  //   0 < done < total         → In Progress
  const deriveStatus = (p: PhaseEntry): string => {
    if (p.todosTotal === 0) return p.tableStatus || p.fileStatus || 'unknown';
    if (p.todosDone >= p.todosTotal) return 'Complete';
    if (p.todosDone === 0) return 'Pending';
    return 'In Progress';
  };

  // Summary counts
  const completedCount = phases.filter(p => isComplete(deriveStatus(p))).length;
  const totalDone = phases.reduce((s, p) => s + p.todosDone, 0);
  const totalTodos = phases.reduce((s, p) => s + p.todosTotal, 0);

  // Header box
  const titleLine = `  Plan: ${planTitle}`;
  const phaseLine = totalTodos > 0
    ? `  Phases: ${completedCount}/${phases.length} complete  |  Tasks: ${progressBar(totalDone, totalTodos)}`
    : `  Phases: ${completedCount}/${phases.length} complete`;
  const width = Math.max(titleLine.length, phaseLine.length, 60);
  const border = '═'.repeat(width);
  console.log(chalk.cyan(`╔${border}╗`));
  console.log(chalk.cyan('║') + chalk.bold(titleLine.padEnd(width)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + phaseLine.padEnd(width) + chalk.cyan('║'));
  console.log(chalk.cyan(`╚${border}╝`));
  console.log('');

  // Per-phase rows
  for (const phase of phases) {
    const status = deriveStatus(phase);
    const badge = statusBadge(status);
    console.log(chalk.white(`  Phase ${phase.phaseNum}: ${phase.title}`) + '  ' + badge);
    if (phase.todosTotal > 0) {
      console.log(`    ${progressBar(phase.todosDone, phase.todosTotal)}`);
    }
    console.log('');
  }
}
