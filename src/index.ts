import { Command } from 'commander';
import { watchCommand } from './commands/watch/watch-command.js';

const program = new Command();
program
  .name('claude-swarm')
  .description('AI-powered GitHub issue automation daemon')
  .version('0.1.0');

program.addCommand(watchCommand);
program.parse();
