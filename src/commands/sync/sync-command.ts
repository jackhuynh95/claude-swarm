// sync-command.ts — Wires smart-pull, smart-push, and alignment-checker into `claude-swarm sync`.
// Subcommands: pull | push | check
// Cross-cutting flags: --dry-run, --force, --project, --vault, --brain

import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Command } from 'commander';
import { smartPull } from './smart-pull.js';
import { smartPush } from './smart-push.js';
import { checkAlignment } from './alignment-checker.js';
import { loadProjectConfig } from '../../config-resolver.js';

interface PathOpts { vault?: string; brain?: string; project?: string }

function resolvePaths(opts: PathOpts) {
  const config = loadProjectConfig();
  return {
    vaultPath: resolve(opts.vault ?? config.vault ?? './obsidian-vault'),
    brainPath: resolve(opts.brain ?? config.brain ?? '../second-brain'),
    projectName: opts.project ?? basename(process.cwd()),
  };
}

// Resolves context string: plain string or @filepath (relative to cwd)
function resolveContext(ctx: string): string {
  if (ctx.startsWith('@')) {
    const filePath = ctx.slice(1);
    if (!existsSync(filePath)) throw new Error(`Context file not found: ${filePath}`);
    return readFileSync(filePath, 'utf8');
  }
  return ctx;
}

export const syncCommand = new Command('sync')
  .description('Smart vault sync — promote, inject, and check knowledge alignment (secondary/global scope)');

syncCommand
  .command('pull')
  .description('Promote project vault notes to second-brain')
  .option('--project <name>', 'Project name (default: cwd basename)')
  .option('--vault <path>', 'Project vault path')
  .option('--brain <path>', 'Second-brain path')
  .option('--dry-run', 'Preview without writing', false)
  .option('--force', 'Skip Claude classification (not yet implemented)', false)
  .action(async (opts) => {
    try {
      if (opts.force) console.log('[sync] --force not yet implemented, using smart sync');
      const paths = resolvePaths(opts);
      const result = await smartPull({ ...paths, dryRun: opts.dryRun });
      console.log(`\nPromoted: ${result.promoted} | Skipped: ${result.skipped}`);
    } catch (err) {
      console.error(`[sync pull] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

syncCommand
  .command('push')
  .description('Inject relevant second-brain notes into project vault')
  .requiredOption('--context <ctx>', 'Task/issue context for relevance scoring (use @filepath, relative to cwd)')
  .option('--project <name>', 'Project name (default: cwd basename)')
  .option('--vault <path>', 'Project vault path')
  .option('--brain <path>', 'Second-brain path')
  .option('--dry-run', 'Preview without writing', false)
  .option('--force', 'Skip Claude relevance filter (not yet implemented)', false)
  .action(async (opts) => {
    try {
      if (opts.force) console.log('[sync] --force not yet implemented, using smart sync');
      const paths = resolvePaths(opts);
      const context = resolveContext(opts.context);
      const result = await smartPush({ ...paths, context, dryRun: opts.dryRun });
      console.log(`\nInjected: ${result.injected} | Skipped: ${result.skipped}`);
    } catch (err) {
      console.error(`[sync push] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

syncCommand
  .command('check')
  .description('Check alignment between project vault and second-brain')
  .option('--project <name>', 'Project name (default: cwd basename)')
  .option('--vault <path>', 'Project vault path')
  .option('--brain <path>', 'Second-brain path')
  .option('--dry-run', 'Preview without writing', false)
  .option('--auto-update', 'Copy newer version and backup old', false)
  .action(async (opts) => {
    try {
      const paths = resolvePaths(opts);
      const result = await checkAlignment({ ...paths, dryRun: opts.dryRun, autoUpdate: opts.autoUpdate });
      console.log(`\nTotal: ${result.total} | Aligned: ${result.aligned} | Drifted: ${result.drifted}`);
    } catch (err) {
      console.error(`[sync check] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
