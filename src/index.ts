#!/usr/bin/env node
import { Command } from 'commander';
import { watchCommand } from './commands/watch/watch-command.js';
import { readCommand } from './cli/slack-reader.js';
import { brainstormCommand } from './cli/brainstormer.js';
import { reportCommand } from './cli/report-issue.js';
import { statusCommand } from './commands/status/status-command.js';

const program = new Command();
program
  .name('claude-swarm')
  .description('AI-powered GitHub issue automation daemon')
  .version('0.4.0');

program.addCommand(watchCommand);
program.addCommand(readCommand);
program.addCommand(brainstormCommand);
program.addCommand(reportCommand);
program.addCommand(statusCommand);
program.parse();
