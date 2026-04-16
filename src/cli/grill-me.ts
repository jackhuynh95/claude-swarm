import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface GrillMeOptions {
  context?: string;
  model?: string;
  planDir?: string;
  auto?: boolean;
}

/**
 * Spawn Claude in interactive session mode (no -p flag).
 * The initial prompt is passed as a positional argument, which seeds the first
 * message but keeps the session alive for multi-turn conversation.
 * stdio: 'inherit' gives the user full terminal control.
 */
function spawnInteractiveSession(prompt: string, model: string, auto?: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    // No -p flag — Claude starts in interactive mode with the prompt as first message
    const args = [prompt, '--model', model];
    if (auto) args.push('--dangerously-skip-permissions');

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', (err) => reject(err));
  });
}

async function executeGrillMe(topic: string, options: GrillMeOptions): Promise<void> {
  const modelOverride = options.model ?? 'claude-opus-4-6';

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

  const prompt = `/ttw:grill-me ${topic}${contextContent}${planDirHint}

Ask 8-15 sharp questions, force decisions on major choices, consolidate answers, then write plans/<plan-dir>/spec.md and output the handoff command.`;

  console.log(`Grilling: "${topic}"...`);

  const code = await spawnInteractiveSession(prompt, modelOverride, options.auto);
  if (code !== 0) {
    process.exit(code);
  }
}

export const grillMeCommand = new Command('grill-me')
  .description('Run a spec-interview before planning. Writes plans/<plan-dir>/spec.md.')
  .argument('<topic>', 'Topic or request to clarify')
  .option('-c, --context <file>', 'Context file path (e.g. @docs/roadmap.md)')
  .option('-m, --model <model>', 'Model override (default: opus)')
  .option('-d, --plan-dir <dir>', 'Target plan directory for spec.md output')
  .option('-a, --auto', 'Auto mode — skip permission prompts')
  .action(executeGrillMe);
