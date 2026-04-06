import { execSync } from 'node:child_process';
import chalk from 'chalk';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MilestoneInfo {
  title: string;
  number: number;
  openIssues: number;
  closedIssues: number;
}

interface ChildStatus {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
}

interface EpicStatus {
  number: number;
  title: string;
  children: ChildStatus[];
}

/** Phase progress parsed from a [Milestone] issue checklist body. */
interface PhaseProgress {
  title: string;
  done: number;
  total: number;
}

interface RepoInfo {
  owner: string;
  name: string;
}

// ─── GitHub helpers ────────────────────────────────────────────────────────────

function getRepoInfo(): RepoInfo {
  const raw = execSync('gh repo view --json owner,name', { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as { owner: { login: string }; name: string };
  return { owner: parsed.owner.login, name: parsed.name };
}

/** Fetch milestones, optionally filtered by title. */
function fetchMilestones(repo: RepoInfo, name?: string): MilestoneInfo[] {
  const raw = execSync(
    `gh api repos/${repo.owner}/${repo.name}/milestones?state=open&per_page=50`,
    { encoding: 'utf-8' },
  );
  const milestones = JSON.parse(raw) as Array<{
    title: string;
    number: number;
    open_issues: number;
    closed_issues: number;
  }>;

  const infos: MilestoneInfo[] = milestones.map(m => ({
    title: m.title,
    number: m.number,
    openIssues: m.open_issues,
    closedIssues: m.closed_issues,
  }));

  if (name) {
    const match = infos.filter(m => m.title.toLowerCase().includes(name.toLowerCase()));
    return match.length > 0 ? match : [];
  }

  // Default: most recent open milestone (first returned)
  return infos.length > 0 ? [infos[0]] : [];
}

/** Fetch epic issues for a milestone. */
function fetchEpics(milestoneTitle: string): EpicStatus[] {
  try {
    const raw = execSync(
      `gh issue list --label "epic" --milestone ${JSON.stringify(milestoneTitle)} --state all --json number,title,state -L 100`,
      { encoding: 'utf-8' },
    );
    const issues = JSON.parse(raw) as Array<{ number: number; title: string; state: string }>;
    return issues.map(i => ({
      number: i.number,
      title: i.title,
      // children populated later
      children: [],
    }));
  } catch {
    return [];
  }
}

/** Parse epic body for task list items `- [x] #N` / `- [ ] #N`, then batch-fetch their states. */
function loadEpicChildren(epics: EpicStatus[]): void {
  if (epics.length === 0) return;

  // Collect all child issue numbers across epics
  const epicBodies: Map<number, string> = new Map();
  for (const epic of epics) {
    try {
      const raw = execSync(`gh issue view ${epic.number} --json body`, { encoding: 'utf-8' });
      const { body } = JSON.parse(raw) as { body: string };
      epicBodies.set(epic.number, body ?? '');
    } catch {
      epicBodies.set(epic.number, '');
    }
  }

  // Gather all child numbers
  const allChildNumbers: Set<number> = new Set();
  const epicChildNumbers: Map<number, number[]> = new Map();
  for (const epic of epics) {
    const body = epicBodies.get(epic.number) ?? '';
    const childNums: number[] = [];
    const re = /- \[[ x]\]\s+#(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const n = parseInt(m[1], 10);
      childNums.push(n);
      allChildNumbers.add(n);
    }
    epicChildNumbers.set(epic.number, childNums);
  }

  if (allChildNumbers.size === 0) return;

  // Batch fetch all child issues in one call
  const stateMap: Map<number, ChildStatus> = new Map();
  try {
    const raw = execSync(
      `gh issue list --state all --json number,title,state -L 500`,
      { encoding: 'utf-8' },
    );
    const issues = JSON.parse(raw) as Array<{ number: number; title: string; state: string }>;
    for (const issue of issues) {
      if (allChildNumbers.has(issue.number)) {
        stateMap.set(issue.number, {
          number: issue.number,
          title: issue.title,
          state: issue.state.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
        });
      }
    }
  } catch {
    // Batch failed — fall back to individual fetches for each child
    for (const n of allChildNumbers) {
      try {
        const raw = execSync(`gh issue view ${n} --json number,title,state`, { encoding: 'utf-8' });
        const issue = JSON.parse(raw) as { number: number; title: string; state: string };
        stateMap.set(n, {
          number: issue.number,
          title: issue.title,
          state: issue.state.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN',
        });
      } catch {
        // Skip unreachable issue
      }
    }
  }

  // Assign children to epics
  for (const epic of epics) {
    const childNums = epicChildNumbers.get(epic.number) ?? [];
    epic.children = childNums
      .map(n => stateMap.get(n))
      .filter((c): c is ChildStatus => c !== undefined);
  }
}

// ─── Display helpers ───────────────────────────────────────────────────────────

function progressBar(done: number, total: number, width = 20): string {
  if (total === 0) return chalk.dim('░'.repeat(width) + ' 0/0');
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  const pct = Math.round((done / total) * 100);
  const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `${bar} ${done}/${total} (${pct}%)`;
}

function renderMilestoneHeader(info: MilestoneInfo): void {
  const done = info.closedIssues;
  const total = info.openIssues + info.closedIssues;
  const bar = progressBar(done, total);
  const titleLine = `  Milestone: ${info.title}`;
  const barLine = `  ${bar}`;
  const width = Math.max(titleLine.length, 50);
  const border = '═'.repeat(width);
  console.log(chalk.cyan(`╔${border}╗`));
  console.log(chalk.cyan('║') + chalk.bold(titleLine.padEnd(width)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + barLine.padEnd(width) + chalk.cyan('║'));
  console.log(chalk.cyan(`╚${border}╝`));
  console.log('');
}

function renderEpics(epics: EpicStatus[]): void {
  if (epics.length === 0) {
    console.log(chalk.yellow('  No epics found for this milestone.'));
    return;
  }
  for (const epic of epics) {
    const done = epic.children.filter(c => c.state === 'CLOSED').length;
    const total = epic.children.length;
    console.log(chalk.white(`  Epic #${epic.number}: ${epic.title}`));
    console.log(`    ${progressBar(done, total)}`);
    console.log('');
  }
}

// ─── [Milestone] issue support (no epics, checklist-based progress) ───────────

/** Find [Milestone] issues and parse their body checklists into phase progress. */
function fetchMilestoneIssues(): Array<{ number: number; title: string; phases: PhaseProgress[] }> {
  try {
    const raw = execSync(
      'gh issue list --search "[Milestone]" --state open --json number,title,body -L 20',
      { encoding: 'utf-8' },
    );
    const issues = JSON.parse(raw) as Array<{ number: number; title: string; body: string }>;
    return issues
      .filter(i => i.title.startsWith('[Milestone]'))
      .map(i => ({
        number: i.number,
        title: i.title.replace(/^\[Milestone\]\s*/, ''),
        phases: parseMilestoneBody(i.body ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Parse a [Milestone] issue body into phase progress by reading ### headings and checklists. */
function parseMilestoneBody(body: string): PhaseProgress[] {
  const phases: PhaseProgress[] = [];
  let current: PhaseProgress | null = null;

  for (const line of body.split('\n')) {
    // Phase heading: ### Phase N — Name
    if (/^###\s+/.test(line)) {
      if (current) phases.push(current);
      current = { title: line.replace(/^###\s+/, '').trim(), done: 0, total: 0 };
      continue;
    }
    // Checklist item
    if (current && /^- \[[ x]\]/.test(line)) {
      current.total++;
      if (/^- \[x\]/.test(line)) current.done++;
    }
  }
  if (current) phases.push(current);
  return phases;
}

/** Render [Milestone] issues with phase-level progress bars. */
function renderMilestoneIssues(issues: Array<{ number: number; title: string; phases: PhaseProgress[] }>): void {
  for (const issue of issues) {
    const totalDone = issue.phases.reduce((s, p) => s + p.done, 0);
    const totalAll = issue.phases.reduce((s, p) => s + p.total, 0);

    // Header
    const titleLine = `  [Milestone] #${issue.number}: ${issue.title}`;
    const barLine = `  ${progressBar(totalDone, totalAll)}`;
    const width = Math.max(titleLine.length, 50);
    const border = '═'.repeat(width);
    console.log(chalk.cyan(`╔${border}╗`));
    console.log(chalk.cyan('║') + chalk.bold(titleLine.padEnd(width)) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + barLine.padEnd(width) + chalk.cyan('║'));
    console.log(chalk.cyan(`╚${border}╝`));
    console.log('');

    // Phases
    for (const phase of issue.phases) {
      console.log(chalk.white(`  ${phase.title}`));
      console.log(`    ${progressBar(phase.done, phase.total)}`);
      console.log('');
    }
  }
}

/** Try importing getDailySummary from cost-tracker; silently skip if unavailable. */
async function renderCostSummary(): Promise<void> {
  try {
    // Dynamic import so missing module fails silently
    // cost-tracker.ts is an optional dependency (may not exist yet)
    // Use computed path so TypeScript does not resolve this optional module at compile time
    const modPath = './cost-tracker.js';
    const mod = await import(/* @vite-ignore */ modPath).catch(() => null);
    if (!mod || typeof mod.getDailySummary !== 'function') return;

    const summary = mod.getDailySummary() as {
      totalUsd: number;
      runCount: number;
      topIssues: Array<{ number: number; usd: number }>;
    } | null;

    if (!summary) return;

    const topStr = summary.topIssues
      .slice(0, 3)
      .map(i => `#${i.number} ($${i.usd.toFixed(2)})`)
      .join(', ');

    console.log(chalk.yellow(`\n💰 Cost (today): $${summary.totalUsd.toFixed(2)} across ${summary.runCount} run${summary.runCount !== 1 ? 's' : ''}`));
    if (topStr) console.log(chalk.dim(`   Top: ${topStr}`));
  } catch {
    // Cost tracker not available — skip silently
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function showBuildStatus(options?: { milestone?: string }): Promise<void> {
  // 1. Detect repo
  let repo: RepoInfo;
  try {
    repo = getRepoInfo();
  } catch {
    console.error(chalk.red('Error: Could not detect GitHub repo. Is `gh` installed and authenticated?'));
    process.exit(1);
  }

  // 2. Fetch milestone(s)
  let milestones: MilestoneInfo[];
  try {
    milestones = fetchMilestones(repo, options?.milestone);
  } catch (err) {
    console.error(chalk.red('Error fetching milestones:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // 3. Try [Milestone] issues first (checklist-based, no GitHub milestones needed)
  const milestoneIssues = fetchMilestoneIssues();
  if (milestoneIssues.length > 0) {
    renderMilestoneIssues(milestoneIssues);
    await renderCostSummary();
    return;
  }

  // 4. Fall back to GitHub milestones + epic issues
  if (milestones.length === 0) {
    const hint = options?.milestone ? ` matching "${options.milestone}"` : '';
    console.log(chalk.yellow(`No open milestones or [Milestone] issues found${hint}.`));
    return;
  }

  for (const milestone of milestones) {
    renderMilestoneHeader(milestone);

    const epics = fetchEpics(milestone.title);
    if (epics.length === 0) {
      console.log(chalk.dim(`  No epics found for milestone "${milestone.title}".`));
      console.log('');
      continue;
    }

    loadEpicChildren(epics);
    renderEpics(epics);
  }

  // 4. Optional cost summary
  await renderCostSummary();
}
