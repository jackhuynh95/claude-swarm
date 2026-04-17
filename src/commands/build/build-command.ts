import { Command } from 'commander';
import { generateRoadmap } from './roadmap-generator.js';
import { generateDoc } from './generate-doc.js';
import { fromScratch } from './from-scratch-pipeline.js';
import {
  executeEpic,
  executeAllEpics,
  executeFromRoadmap,
  planEpicIssues,
  cookEpicIssues,
  type ExecutorOptions,
} from './epic-executor.js';
import { showBuildStatus } from './build-status.js';
import { loadProjectConfig } from '../../config-resolver.js';

export const buildCommand = new Command('build')
  .description('Generate roadmaps, create issues, and execute implementation pipelines');

buildCommand
  .command('generate <input>')
  .description('Generate a roadmap via brainstorm → plan --hard → scenario pipeline')
  .option('--context <file>', 'Additional context file (@path)')
  .option('--epics <n>', 'Number of epics (default: auto)', parseInt)
  .option('--dry-run', 'Preview pipeline steps without executing', false)
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--timeout <s>', 'Timeout per step in seconds (default: 1800)', parseInt)
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
  .option('--timeout <s>', 'Timeout in seconds (default: 1800)', parseInt)
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
  .command('run')
  .description('Execute tasks from a roadmap/plan/phase file or GitHub epic issues.\n' +
    '  --roadmap accepts three inputs:\n' +
    '    1. docs/implement-roadmap-*.md  (multi-phase doc, use --phase N to pick one)\n' +
    '    2. plans/<slug>/plan.md         (wrapper — expands to all linked phase-*.md)\n' +
    '    3. plans/<slug>/phase-*.md      (single phase, runnable directly; use --from-task N)')
  .option('--roadmap <path>', 'Path to roadmap doc, plan.md, or phase-*.md (@path supported)')
  .option('--phase <n>', 'Run specific phase from roadmap doc (1-indexed)', parseInt)
  .option('--issue <n>', 'GitHub issue number to sync progress checklist to', parseInt)
  .option('--epic <n>', '[DEPRECATED] Run specific GitHub epic by issue number', parseInt)
  .option('--all', 'Run all phases (roadmap) or all epics (deprecated)')
  .option('--from <n>', 'Resume from phase/epic number N', parseInt)
  .option('--from-task <n>', 'Skip tasks with ID < N within a phase', parseInt)
  .option('--remaining', 'Skip fully complete linked phase files (plan.md only)')
  .option('--fast', 'Skip /ck:plan step, go straight to /ck:cook (default: plan first)')
  .option('--hard', 'Deep analysis: plan red-team + predict per task')
  .option('--auto', 'Enable auto mode for all claude calls')
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per step in seconds (default: 1800)', parseInt)
  .option('--dry-run', 'Show what would run without executing')
  .option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
  .action(async (opts) => {
    // Merge .claude-swarm.json config — CLI flags override config values
    const config = loadProjectConfig();
    const executorOpts = {
      auto:           opts.auto   ?? config.auto,
      hard:           opts.hard   ?? config.redTeam,
      fast:           opts.fast,
      budget:         opts.budget,
      permissionMode: opts.permissionMode,
      timeout:        opts.timeout,
      dryRun:         opts.dryRun,
      fromIssue:      opts.fromTask,
      fromEpic:       opts.from,
      model:          opts.model,
      effort:         opts.effort,
      remaining:      opts.remaining,
    };
    if (opts.roadmap) {
      // Roadmap mode: --phase N for single phase, --all for all phases
      const roadmapPath = opts.roadmap.replace(/^@/, '');
      await executeFromRoadmap(roadmapPath, {
        ...executorOpts,
        trackingIssue: opts.issue,
        phase:         opts.phase,
      });
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
  .description('[DEPRECATED] Run /ck:plan step for each open issue in an epic')
  .option('--epic <n>', 'Epic issue number', parseInt)
  .option('--budget <n>', 'Max USD per claude call', parseFloat)
  .option('--permission-mode <mode>', 'Permission mode: auto or skip')
  .option('--timeout <s>', 'Timeout per call in seconds', parseInt)
  .option('--dry-run', 'Show what would run')
  .option('--model <model>', 'Override model for all steps (opus|sonnet|haiku)')
  .option('--effort <level>', 'Override effort for all steps (low|medium|high|max)')
  .action(async (opts) => {
    if (opts.epic == null) { console.error('Error: --epic <n> is required'); process.exit(1); }
    const config = loadProjectConfig();
    await planEpicIssues(opts.epic, {
      auto:           config.auto,
      budget:         opts.budget,
      permissionMode: opts.permissionMode,
      timeout:        opts.timeout,
      dryRun:         opts.dryRun,
      model:          opts.model,
      effort:         opts.effort,
    });
  });

buildCommand
  .command('cook')
  .description('[DEPRECATED] Run /ck:cook step for each open issue in an epic')
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
    const config = loadProjectConfig();
    await cookEpicIssues(opts.epic, {
      auto:           opts.auto ?? config.auto,
      budget:         opts.budget,
      permissionMode: opts.permissionMode,
      timeout:        opts.timeout,
      dryRun:         opts.dryRun,
      model:          opts.model,
      effort:         opts.effort,
    });
  });

buildCommand
  .command('status')
  .description('Show build progress — from a local plan.md file or GitHub milestone/epic hierarchy')
  .option('--milestone <name>', 'Filter by milestone name (GitHub mode)')
  .option('--plan <path>', 'Read a local plan.md file for phase-level progress (@path supported, no GitHub needed)')
  .option('--remaining', 'Hide fully complete phases (plan.md root mode only)')
  .action(async (opts) => {
    const plan = opts.plan ? opts.plan.replace(/^@/, '') : undefined;
    await showBuildStatus({ milestone: opts.milestone, plan, remaining: opts.remaining });
  });
