import { Command } from 'commander';
import { generateRoadmap } from './roadmap-generator.js';
import { fromScratch } from './from-scratch-pipeline.js';
import { parseRoadmap } from './roadmap-parser.js';

export const buildCommand = new Command('build')
  .description('Generate roadmaps, create issues, and execute implementation pipelines');

buildCommand
  .command('generate <input>')
  .description('Generate a structured roadmap from a topic or @file')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics (default: auto)', parseInt)
  .option('--dry-run', 'Print roadmap to stdout without saving', false)
  .option('--output-dir <dir>', 'Output directory (default: docs)', 'docs')
  .action(async (input: string, opts: { context?: string; epics?: number; dryRun: boolean; outputDir: string }) => {
    const result = await generateRoadmap({
      input,
      context: opts.context,
      epics: opts.epics,
      dryRun: opts.dryRun,
      outputDir: opts.outputDir,
    });
    if (!opts.dryRun && result.roadmapPath) {
      console.log(`Roadmap saved to: ${result.roadmapPath}`);
    }
  });

buildCommand
  .command('from-scratch <input>')
  .description('One-liner: generate roadmap → create issues → execute epics')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics', parseInt)
  .option('--auto', 'Enable auto mode for all steps', false)
  .option('--budget <n>', 'Max USD budget per step', parseFloat)
  .option('--dry-run', 'Generate roadmap only, skip init and run', false)
  .action(async (input: string, opts: { context?: string; epics?: number; auto: boolean; budget?: number; dryRun: boolean }) => {
    await fromScratch({
      input,
      context: opts.context,
      epics: opts.epics,
      auto: opts.auto,
      budget: opts.budget,
      dryRun: opts.dryRun,
    });
  });

buildCommand
  .command('init <roadmap>')
  .description('Parse roadmap and create GitHub hierarchy')
  .option('--dry-run', 'Show parsed structure without creating issues')
  .action(async (roadmapPath: string, options: { dryRun?: boolean }) => {
    const filePath = roadmapPath.replace(/^@/, '');
    const parsed = parseRoadmap(filePath);
    if (options.dryRun) {
      console.log(JSON.stringify(parsed, null, 2));
      return;
    }
    // TODO: Phase 2 will wire to github-hierarchy.ts
    console.log(JSON.stringify(parsed, null, 2));
  });

buildCommand
  .command('run')
  .description('Execute epics from roadmap issues (Phase 3 — not yet implemented)')
  .option('--all', 'Run all epics')
  .option('--auto', 'Enable auto mode')
  .option('--budget <n>', 'Max USD budget', parseFloat)
  .action(() => {
    console.log('⚠ Phase 3: Epic Executor — not yet implemented');
    console.log('  Coming soon: claude-swarm build run --all --auto');
  });

buildCommand
  .command('status')
  .description('Show build pipeline status (Phase 4 — not yet implemented)')
  .action(() => {
    console.log('⚠ Phase 4: Build Status — not yet implemented');
  });
