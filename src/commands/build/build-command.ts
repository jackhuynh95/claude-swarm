import { Command } from 'commander';
import { generateRoadmap } from './roadmap-generator.js';
import { fromScratch } from './from-scratch-pipeline.js';
import { parseRoadmap } from './roadmap-parser.js';
import {
  executeEpic,
  executeAllEpics,
  planEpicIssues,
  cookEpicIssues,
  type ExecutorOptions,
} from './epic-executor.js';
import { showBuildStatus } from './build-status.js';

export const buildCommand = new Command('build')
  .description('Generate roadmaps, create issues, and execute implementation pipelines');

buildCommand
  .command('generate <input>')
  .description('Generate a structured roadmap from a topic or @file')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics (default: auto)', parseInt)
  .option('--dry-run', 'Print roadmap to stdout without saving', false)
  .option('--output-dir <dir>', 'Output directory (default: docs)', 'docs')
  .action(async (input, opts) => {
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
  .description('One-liner: generate roadmap -> create issues -> execute epics')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics', parseInt)
  .option('--auto', 'Enable auto mode for all steps', false)
  .option('--budget <n>', 'Max USD budget per step', parseFloat)
  .option('--dry-run', 'Generate roadmap only, skip init and run', false)
  .action(async (input, opts) => {
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
  .action(async (roadmapPath, options) => {
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
  .description('Execute plan->cook->test->commit pipeline for epics')
  .option('--epic <n>', 'Run specific epic by issue number', parseInt)
  .option('--all', 'Run all open epics (label: epic)')
  .option('--from <n>', 'Resume from epic number N (with --all)', parseInt)
  .option('--from-issue <n>', 'Skip child issues < N within an epic', parseInt)
  .option('--auto', 'Enable auto mode for all claude calls')
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per step in seconds (default: 600)', parseInt)
  .option('--dry-run', 'Show what would run without executing')
  .action(async (opts) => {
    const executorOpts = {
      auto:           opts.auto,
      budget:         opts.budget,
      permissionMode: opts.permissionMode,
      timeout:        opts.timeout,
      dryRun:         opts.dryRun,
      fromIssue:      opts.fromIssue,
      fromEpic:       opts.from,
    };
    if (opts.all) {
      await executeAllEpics(executorOpts);
    } else if (opts.epic != null) {
      await executeEpic(opts.epic, executorOpts);
    } else {
      console.error('Error: specify --epic <n> or --all');
      process.exit(1);
    }
  });

buildCommand
  .command('plan')
  .description('Run /ck:plan step for each open issue in an epic')
  .option('--epic <n>', 'Epic issue number', parseInt)
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per call in seconds', parseInt)
  .option('--dry-run', 'Show what would run')
  .action(async (opts) => {
    if (opts.epic == null) { console.error('Error: --epic <n> is required'); process.exit(1); }
    await planEpicIssues(opts.epic, {
      budget: opts.budget,
      permissionMode: opts.permissionMode,
      timeout: opts.timeout,
      dryRun: opts.dryRun,
    });
  });

buildCommand
  .command('cook')
  .description('Run /ck:cook step for each open issue in an epic')
  .option('--epic <n>', 'Epic issue number', parseInt)
  .option('--auto', 'Enable auto mode')
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per call in seconds', parseInt)
  .option('--dry-run', 'Show what would run')
  .action(async (opts) => {
    if (opts.epic == null) { console.error('Error: --epic <n> is required'); process.exit(1); }
    await cookEpicIssues(opts.epic, {
      auto: opts.auto,
      budget: opts.budget,
      permissionMode: opts.permissionMode,
      timeout: opts.timeout,
      dryRun: opts.dryRun,
    });
  });

buildCommand
  .command('status')
  .description('Show build progress across milestone/epic/issue hierarchy')
  .option('--milestone <name>', 'Filter by milestone name')
  .action(async (opts) => {
    await showBuildStatus(opts);
  });
