import { Command } from 'commander';
import { Octokit } from '@octokit/rest';
import { invokeClaudePhase } from '../commands/watch/phases/claude-invoker.js';
import type { ClaudeModel } from '../commands/watch/types.js';

interface ReadOptions {
  since: string;
  output: string;
  repo?: string;
  model?: string;
}

async function executeSlackRead(channel: string, options: ReadOptions): Promise<void> {
  const modelOverride = options.model as ClaudeModel | undefined;

  const prompt = `Use the /slack-read skill to read messages from the Slack channel "${channel}" from the last ${options.since}.
Extract all actionable tasks, bugs, feature requests, and decisions.
Format output as a numbered list with: task title, source (who said it), and priority (high/medium/low).
If no tasks found, say "No actionable tasks found."`;

  console.log(`Reading Slack channel: ${channel} (last ${options.since})...`);

  const result = await invokeClaudePhase(prompt, 'slack_read', modelOverride, true);

  if (!result.success) {
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exit(1);
  }

  const output = result.output ?? '';

  if (options.output === 'json') {
    // Wrap raw output in a JSON envelope
    console.log(JSON.stringify({ channel, since: options.since, tasks: output }, null, 2));
    return;
  }

  if (options.output === 'issues' && options.repo) {
    await createGitHubIssues(output, options.repo);
    return;
  }

  console.log(output);
}

async function createGitHubIssues(tasksText: string, repo: string): Promise<void> {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    console.error('Error: --repo must be in "owner/repo" format');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable required for issue creation');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Parse numbered list items as individual tasks
  const lines = tasksText.split('\n').filter((l) => /^\d+\./.test(l.trim()));

  if (lines.length === 0) {
    console.log('No tasks to create issues for.');
    return;
  }

  console.log(`Creating ${lines.length} GitHub issue(s) in ${repo}...`);
  for (const line of lines) {
    const title = line.replace(/^\d+\.\s*/, '').split('—')[0]?.trim() ?? line;
    const { data } = await octokit.issues.create({
      owner,
      repo: repoName,
      title,
      body: `Extracted from Slack by claude-swarm.\n\n${line}`,
      labels: ['slack-import'],
    });
    console.log(`  Created #${data.number}: ${title}`);
  }
}

export const readCommand = new Command('read')
  .description('Extract tasks from Slack channel')
  .argument('<channel>', 'Slack channel name or ID')
  .option('-s, --since <duration>', 'Time window (e.g. 24h, 7d)', '24h')
  .option('-o, --output <format>', 'Output format: text|json|issues', 'text')
  .option('-r, --repo <owner/repo>', 'Create GitHub issues (requires --output issues)')
  .option('-m, --model <model>', 'Model override (opus|sonnet|haiku)')
  .action(executeSlackRead);
