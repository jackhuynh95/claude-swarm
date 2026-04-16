#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { watchCommand } from './commands/watch/watch-command.js';
import { readCommand } from './cli/slack-reader.js';
import { brainstormCommand } from './cli/brainstormer.js';
import { grillMeCommand } from './cli/grill-me.js';
import { grillMePlanFastCommand } from './cli/grill-me-plan-fast.js';
import { reportCommand } from './cli/report-issue.js';
import { statusCommand } from './commands/status/status-command.js';
import { buildCommand } from './commands/build/build-command.js';
import { syncCommand } from './commands/sync/sync-command.js';

// Read version from package.json at runtime (no more hardcoded version)
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();
program
  .name('claude-swarm')
  .description('AI-powered GitHub issue automation daemon')
  .version(pkg.version);

program.addCommand(watchCommand);
program.addCommand(readCommand);
program.addCommand(brainstormCommand);
program.addCommand(grillMeCommand);
program.addCommand(grillMePlanFastCommand);
program.addCommand(reportCommand);
program.addCommand(statusCommand);
program.addCommand(buildCommand);
program.addCommand(syncCommand);
program.parse();
