import chalk from 'chalk';
import { generateRoadmap } from './roadmap-generator.js';

export interface FromScratchOptions {
  input: string;
  context?: string;
  epics?: number;
  auto?: boolean;
  budget?: number;
  dryRun?: boolean;
}

/**
 * Print a numbered step header.
 */
function showStep(step: number, total: number, message: string): void {
  console.log(chalk.cyan(`[${step}/${total}]`) + ' ' + message);
}

/**
 * Main from-scratch pipeline: generate → init → run.
 * Phase 0: only generate is implemented; init and run are stubbed.
 */
export async function fromScratch(opts: FromScratchOptions): Promise<void> {
  showStep(1, 3, 'Generating roadmap...');
  await generateRoadmap({
    input:   opts.input,
    context: opts.context,
    epics:   opts.epics,
    dryRun:  opts.dryRun,
    budget:  opts.budget,
  });

  if (opts.dryRun) {
    console.log(chalk.yellow('Dry run complete — skipping init and run.'));
    return;
  }

  showStep(2, 3, 'Creating GitHub [MILESTONE] issue...');
  console.log(chalk.yellow('⚠ Run manually: claude-swarm build init @<roadmap-path>'));

  showStep(3, 3, 'Executing epics...');
  // TODO: Phase 3 — replace stub with runEpics()
  console.log(chalk.yellow('⚠ Run not yet implemented. Run manually: claude-swarm build run --all --auto'));

  console.log('\n' + chalk.bold('Next steps:'));
  console.log(`  1. Review roadmap in docs/`);
  console.log(`  2. Create issues:  ${chalk.cyan('claude-swarm build init @<roadmap-path>')}`);
  console.log(`  3. Execute epics:  ${chalk.cyan(`claude-swarm build run --all${opts.auto ? ' --auto' : ''}${opts.budget ? ` --budget ${opts.budget}` : ''}`)}`);
}
