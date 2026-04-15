import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { invokeClaudePhase } from '../commands/watch/phases/claude-invoker.js';
import type { ClaudeModel } from '../commands/watch/types.js';

interface GrillMeOptions {
  context?: string;
  model?: string;
  planDir?: string;
}

async function executeGrillMe(topic: string, options: GrillMeOptions): Promise<void> {
  const modelOverride = (options.model ?? 'claude-opus-4-6') as ClaudeModel;

  let contextContent = '';
  if (options.context) {
    try {
      contextContent = `\n\nAdditional context from ${options.context}:\n${readFileSync(options.context, 'utf8')}`;
    } catch {
      console.error(`Warning: Could not read context file: ${options.context}`);
    }
  }

  const planDirHint = options.planDir
    ? `\nWrite spec.md to: ${options.planDir}/spec.md`
    : '';

  const prompt = `Use the /ttw:grill-me skill to run a spec-interview on this topic.

Topic: ${topic}${contextContent}${planDirHint}

Ask 8-15 sharp questions, force decisions on major choices, consolidate answers, then write plans/<plan-dir>/spec.md and output the handoff command.`;

  console.log(`Grilling: "${topic}"...`);

  const result = await invokeClaudePhase(
    prompt,
    'grill_me',
    undefined,
    { model: modelOverride },
    true,
  );

  if (!result.success) {
    console.error(`Error: ${result.error ?? 'Unknown error'}`);
    process.exit(1);
  }

  console.log(result.output ?? '');
}

export const grillMeCommand = new Command('grill-me')
  .description('Run a spec-interview before planning. Writes plans/<plan-dir>/spec.md.')
  .argument('<topic>', 'Topic or request to clarify')
  .option('-c, --context <file>', 'Context file path (e.g. @docs/roadmap.md)')
  .option('-m, --model <model>', 'Model override (default: opus)')
  .option('-d, --plan-dir <dir>', 'Target plan directory for spec.md output')
  .action(executeGrillMe);
