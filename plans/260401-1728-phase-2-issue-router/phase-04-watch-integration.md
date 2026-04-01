# Phase 4: Watch Command Integration

**Priority**: High
**Status**: Pending

---

## Overview

Wire the issue-router and model-router into `watch-command.ts`, replacing the placeholder with a real poll → classify → dispatch cycle using `@octokit/rest`.

## Context

- Current `watch-command.ts` is 11 LOC placeholder
- `@octokit/rest` already in package.json
- Need: poll issues with `ready_for_dev` label → classify → log dispatch decision
- Phase 3 (execution flows) will add actual `debug-flow.ts`/`ship-flow.ts` — this phase just logs the routing decision and prepares the dispatch interface

## Related Code Files

**Modify:**
- `src/commands/watch/watch-command.ts`

**Read:**
- `src/commands/watch/types.ts`
- `src/commands/watch/phases/issue-router.ts`
- `src/commands/watch/phases/model-router.ts`

## Key Insights

- Don't implement execution flows yet (Phase 3). Just classify and log.
- Use a `dispatchIssue()` stub that logs the routing decision and returns.
- The poll loop should: fetch issues → filter by `ready_for_dev` label → classify each → dispatch.
- Use `GITHUB_TOKEN` env var for auth (via dotenv).
- Keep it simple: no state persistence yet (.ck.json is Phase 3+).

## Implementation Steps

1. Update `src/commands/watch/watch-command.ts`:

```typescript
import { Command } from 'commander';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import { classifyIssue } from './phases/issue-router.js';
import { getPhaseConfig, getFlowPhases } from './phases/model-router.js';
import type { GHIssue, ClassifiedIssue, WatchConfig } from './types.js';

export const watchCommand = new Command('watch')
  .description('Watch GitHub issues and dispatch to execution flows')
  .requiredOption('--repo <repo>', 'GitHub repository (owner/repo)')
  .option('--interval <ms>', 'Poll interval in milliseconds', '60000')
  .option('--max-per-hour <n>', 'Max issues to process per hour', '5')
  .action(async (options) => {
    const config: WatchConfig = {
      repo: options.repo,
      intervalMs: parseInt(options.interval, 10),
      maxPerHour: parseInt(options.maxPerHour, 10),
      labels: {
        trigger: 'ready_for_dev',
        shipped: 'shipped',
        verified: 'verified',
        error: 'error',
      },
    };

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error(chalk.red('GITHUB_TOKEN env var required'));
      process.exit(1);
    }

    const octokit = new Octokit({ auth: token });
    const [owner, repo] = config.repo.split('/');

    console.log(chalk.green(`Watching ${config.repo} (poll every ${config.intervalMs}ms)`));

    // Poll loop
    const poll = async () => {
      try {
        const { data: issues } = await octokit.issues.listForRepo({
          owner, repo,
          labels: config.labels.trigger,
          state: 'open',
          per_page: 10,
          sort: 'created',
          direction: 'asc',
        });

        if (issues.length === 0) return;

        console.log(chalk.blue(`Found ${issues.length} issue(s) with "${config.labels.trigger}"`));

        for (const raw of issues) {
          const ghIssue: GHIssue = {
            number: raw.number,
            title: raw.title,
            body: raw.body ?? null,
            labels: (raw.labels as Array<{ name: string }>).filter(l => typeof l === 'object' && 'name' in l),
            state: raw.state as 'open' | 'closed',
            assignee: raw.assignee ? { login: raw.assignee.login } : null,
            html_url: raw.html_url,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
          };

          const classified = classifyIssue(ghIssue);
          dispatchIssue(classified);
        }
      } catch (err) {
        console.error(chalk.red('Poll error:'), err instanceof Error ? err.message : err);
      }
    };

    // Initial poll + interval
    await poll();
    setInterval(poll, config.intervalMs);
  });

/**
 * Dispatch stub — logs routing decision.
 * Phase 3 will replace with actual debug-flow/ship-flow execution.
 */
function dispatchIssue(classified: ClassifiedIssue): void {
  const { issue, issueType, flowType, noTest, modelOverride, flags } = classified;
  const phases = getFlowPhases(flowType, noTest);

  console.log(chalk.yellow(`\n--- Issue #${issue.number}: ${issue.title} ---`));
  console.log(`  Type: ${issueType} → Flow: ${flowType}${noTest ? ' (--no-test)' : ''}`);
  console.log(`  Phases: ${phases.join(' → ')}`);

  if (modelOverride) {
    console.log(`  Model override: ${modelOverride} (hard label)`);
  }

  const activeFlags = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (activeFlags.length > 0) {
    console.log(`  Flags: ${activeFlags.join(', ')}`);
  }

  // Log phase configs
  for (const phase of phases) {
    const config = getPhaseConfig(phase, modelOverride);
    console.log(`    ${phase}: ${config.model}/${config.effort}/${config.maxTurns}t/${config.timeoutMs / 1000}s`);
  }

  // TODO Phase 3: Actually execute flows
  console.log(chalk.gray(`  [stub] Would execute ${flowType} for #${issue.number}`));
}
```

2. Run `npm run build` to verify compilation
3. Test manually: `GITHUB_TOKEN=xxx npx ts-node src/index.ts watch --repo owner/repo`

## Success Criteria

- [ ] `watch --repo owner/repo` polls GitHub issues
- [ ] Issues with `ready_for_dev` label are fetched
- [ ] Each issue is classified and routing decision is logged
- [ ] [BUG] issues show debug-flow phases
- [ ] [FEATURE] issues show ship-flow phases
- [ ] [DOCS] issues show ship-flow with no test phase
- [ ] "hard" labeled issues show opus model override
- [ ] `npm run build` compiles without errors
- [ ] Graceful error handling for missing GITHUB_TOKEN
