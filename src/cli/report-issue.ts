import { Command } from 'commander';
import { Octokit } from '@octokit/rest';
import { invokeClaudePhase } from '../commands/watch/phases/claude-invoker.js';
import type { ClaudeModel } from '../commands/watch/types.js';

interface ReportOptions {
  repo: string;
  issue: string;
  channel?: string;
  model?: string;
}

async function executeReport(options: ReportOptions): Promise<void> {
  const [owner, repoName] = options.repo.split('/');
  if (!owner || !repoName) {
    console.error('Error: --repo must be in "owner/repo" format');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable required');
    process.exit(1);
  }

  const issueNumber = parseInt(options.issue, 10);
  if (isNaN(issueNumber)) {
    console.error('Error: --issue must be a valid number');
    process.exit(1);
  }

  console.log(`Fetching issue #${issueNumber} from ${options.repo}...`);

  const octokit = new Octokit({ auth: token });
  let issueData: { number: number; title: string; body: string | null; state: string; html_url: string };

  try {
    const { data } = await octokit.issues.get({ owner, repo: repoName, issue_number: issueNumber });
    issueData = data as typeof issueData;
  } catch (err) {
    console.error(`Error fetching issue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }

  const modelOverride = options.model as ClaudeModel | undefined;
  const channelInfo = options.channel ? `\nTarget channel: ${options.channel}` : '';

  const prompt = `Use the /slack-report skill to send a Slack report for this GitHub issue.

Issue: #${issueData.number} — ${issueData.title}
Repo: https://github.com/${options.repo}
State: ${issueData.state}
URL: ${issueData.html_url}
Body: ${(issueData.body ?? '(no description)').slice(0, 500)}${channelInfo}

Send a concise Slack message (2-3 lines) summarizing the issue status for the team.`;

  console.log(`Sending Slack report for issue #${issueNumber}...`);

  const result = await invokeClaudePhase(prompt, 'slack_report', modelOverride, true);

  if (!result.success) {
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exit(1);
  }

  console.log(result.output ?? 'Report sent.');
}

export const reportCommand = new Command('report')
  .description('Send Slack report for a GitHub issue')
  .requiredOption('-r, --repo <owner/repo>', 'Repository (owner/repo)')
  .requiredOption('-i, --issue <number>', 'Issue number')
  .option('-c, --channel <channel>', 'Slack channel override')
  .option('-m, --model <model>', 'Model override (opus|sonnet|haiku)')
  .action(executeReport);
