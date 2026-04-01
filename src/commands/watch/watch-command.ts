import { Command } from 'commander';

export const watchCommand = new Command('watch')
  .description('Watch GitHub issues and dispatch to execution flows')
  .option('--repo <repo>', 'GitHub repository (owner/repo)')
  .option('--interval <ms>', 'Poll interval in milliseconds', '60000')
  .action((_options) => {
    console.log('CK watch daemon starting...');
    // TODO: implement watch loop in Phase 2
  });
