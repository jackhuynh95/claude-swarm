import { Command } from 'commander';
import { generateRoadmap } from './roadmap-generator.js';
import { generateDoc } from './generate-doc.js';
import { fromScratch } from './from-scratch-pipeline.js';
import { parseRoadmap } from './roadmap-parser.js';
import { initFromRoadmap } from './github-hierarchy.js';
import {
  executeEpic,
  executeAllEpics,
  executeFromRoadmap,
  planEpicIssues,
  cookEpicIssues,
  type ExecutorOptions,
} from './epic-executor.js';
import { showBuildStatus } from './build-status.js';

export const buildCommand = new Command('build')
  .description('Generate roadmaps, create issues, and execute implementation pipelines');

buildCommand
  .command('generate <input>')
  .description('Generate a roadmap via brainstorm → plan --hard → scenario pipeline')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics (default: auto)', parseInt)
  .option('--dry-run', 'Preview pipeline steps without executing', false)
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--timeout <s>', 'Timeout per step in seconds (default: 600)', parseInt)
  .action(async (input, opts) => {
    await generateRoadmap({
      input,
      context:  opts.context,
      epics:    opts.epics,
      dryRun:   opts.dryRun,
      budget:   opts.budget,
      timeout:  opts.timeout,
    });
  });

buildCommand
  .command('generate-doc <input>')
  .description('Generate a docs/implement-roadmap-{slug}.md from a topic or @file')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of phases/epics (default: auto)', parseInt)
  .option('--dry-run', 'Preview without executing', false)
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--timeout <s>', 'Timeout in seconds (default: 600)', parseInt)
  .option('--model <model>', 'Override model (default: opus)')
  .option('--effort <level>', 'Effort level (default: high)')
  .action(async (input, opts) => {
    await generateDoc({
      input,
      context: opts.context,
      epics:   opts.epics,
      dryRun:  opts.dryRun,
      budget:  opts.budget,
      timeout: opts.timeout,
      model:   opts.model,
      effort:  opts.effort,
    });
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
  .description('Parse roadmap and create GitHub milestone, epic issues, and child issues')
  .option('--dry-run', 'Show parsed structure without creating issues')
  .action(async (roadmapPath, options) => {
    const filePath = roadmapPath.replace(/^@/, '');
    const parsed = parseRoadmap(filePath);
    await initFromRoadmap(parsed, options.dryRun);
  });

buildCommand
  .command('run')
  .description('Execute tasks from a roadmap file or GitHub epic issues')
  .option('--roadmap <path>', 'Run directly from a roadmap markdown file (@path supported)')
  .option('--issue <n>', 'GitHub issue number to sync progress checklist to', parseInt)
  .option('--epic <n>', 'Run specific epic by GitHub issue number', parseInt)
  .option('--all', 'Run all open GitHub epics (label: epic)')
  .option('--from <n>', 'Resume from epic/phase number N', parseInt)
  .option('--from-issue <n>', 'Skip tasks with ID < N', parseInt)
  .option('--hard', 'Deep analysis: plan red-team + predict per issue')
  .option('--auto', 'Enable auto mode for all claude calls')
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per step in seconds (default: 600)', parseInt)
  .option('--dry-run', 'Show what would run without executing')
  .option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
  .action(async (opts) => {
    const executorOpts = {
      auto:           opts.auto,
      hard:           opts.hard,
      budget:         opts.budget,
      permissionMode: opts.permissionMode,
      timeout:        opts.timeout,
      dryRun:         opts.dryRun,
      fromIssue:      opts.fromIssue,
      fromEpic:       opts.from,
      model:          opts.model,
      effort:         opts.effort,
    };
    if (opts.roadmap) {
      const roadmapPath = opts.roadmap.replace(/^@/, '');
      await executeFromRoadmap(roadmapPath, { ...executorOpts, trackingIssue: opts.issue });
    } else if (opts.all) {
      await executeAllEpics(executorOpts);
    } else if (opts.epic != null) {
      await executeEpic(opts.epic, executorOpts);
    } else {
      console.error('Error: specify --roadmap <path>, --epic <n>, or --all');
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
  .option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
  .action(async (opts) => {
    if (opts.epic == null) { console.error('Error: --epic <n> is required'); process.exit(1); }
    await planEpicIssues(opts.epic, {
      budget: opts.budget,
      permissionMode: opts.permissionMode,
      timeout: opts.timeout,
      dryRun: opts.dryRun,
      model: opts.model,
      effort: opts.effort,
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
  .option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
  .action(async (opts) => {
    if (opts.epic == null) { console.error('Error: --epic <n> is required'); process.exit(1); }
    await cookEpicIssues(opts.epic, {
      auto: opts.auto,
      budget: opts.budget,
      permissionMode: opts.permissionMode,
      timeout: opts.timeout,
      dryRun: opts.dryRun,
      model: opts.model,
      effort: opts.effort,
    });
  });

buildCommand
  .command('status')
  .description('Show build progress across milestone/epic/issue hierarchy')
  .option('--milestone <name>', 'Filter by milestone name')
  .action(async (opts) => {
    await showBuildStatus(opts);
  });
