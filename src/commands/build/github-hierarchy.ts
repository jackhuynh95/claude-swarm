/**
 * GitHub Hierarchy Creator — takes a parsed Roadmap and creates
 * a single [Milestone] tracking issue with all phases/tasks as checklist.
 *
 * 1 roadmap = 1 GitHub issue (with [Milestone] prefix)
 */

import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import type { Roadmap } from './roadmap-parser.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitOptions {
  dryRun?: boolean;
}

interface InitResult {
  issueNumber: number;
  title: string;
  url: string;
}

// ─── Build issue body from roadmap ────────────────────────────────────────────

/** Build [Milestone] issue body with phase headings and task checklists. */
function buildMilestoneBody(roadmap: Roadmap): string {
  const lines: string[] = [];
  lines.push(`## Phases`);
  lines.push('');

  for (const epic of roadmap.epics) {
    lines.push(`### ${epic.title}`);
    for (const issue of epic.issues) {
      lines.push(`- [ ] ${issue.title}`);
      for (const sub of issue.subs) {
        lines.push(`  - [ ] ${sub}`);
      }
    }
    lines.push('');
  }

  const totalIssues = roadmap.epics.reduce((sum, e) => sum + e.issues.length, 0);
  lines.push(`**Total:** ${roadmap.epics.length} phases, ${totalIssues} tasks`);

  return lines.join('\n');
}

// ─── GitHub CLI wrapper (shell-safe, no backtick interpolation) ───────────────

/** Run `gh` with args array to avoid shell interpretation of backticks/special chars. */
function gh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`gh ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

// ─── Main: create single [Milestone] issue from parsed roadmap ────────────────

export async function initFromRoadmap(roadmap: Roadmap, opts: InitOptions = {}): Promise<InitResult | null> {
  const milestoneTitle = roadmap.milestone
    .replace(/\s*—\s*Implementation Roadmap$/, '')
    .trim();

  const totalIssues = roadmap.epics.reduce((sum, e) => sum + e.issues.length, 0);
  const issueTitle = `[Milestone] ${milestoneTitle}`;

  if (opts.dryRun) {
    console.log(chalk.yellow('\n--- DRY RUN: would create ---'));
    console.log(chalk.cyan(`  Title: ${issueTitle}`));
    console.log('');
    for (const epic of roadmap.epics) {
      console.log(chalk.white(`  ### ${epic.title}`));
      for (const issue of epic.issues) {
        console.log(chalk.dim(`    - [ ] ${issue.title}`));
      }
    }
    console.log(chalk.cyan(`\n  Total: ${roadmap.epics.length} phases, ${totalIssues} tasks`));
    return null;
  }

  const spinner = ora(`Creating [Milestone] issue: ${milestoneTitle}`).start();

  try {
    const body = buildMilestoneBody(roadmap);
    // Use args array (not shell string) to avoid backtick/special char interpretation
    const url = gh(['issue', 'create', '--title', issueTitle, '--body', body]);

    const numMatch = url.match(/\/(\d+)\s*$/);
    if (!numMatch) throw new Error(`Failed to parse issue number from: ${url}`);
    const issueNumber = parseInt(numMatch[1], 10);

    spinner.succeed(chalk.green(`[Milestone] #${issueNumber}: ${milestoneTitle}`));
    console.log(chalk.dim(`  ${roadmap.epics.length} phases, ${totalIssues} tasks`));
    console.log(chalk.dim(`  ${url}`));

    return { issueNumber, title: issueTitle, url };
  } catch (err) {
    spinner.fail(chalk.red('Failed to create milestone issue'));
    console.error(chalk.dim(String(err)));
    throw err;
  }
}
