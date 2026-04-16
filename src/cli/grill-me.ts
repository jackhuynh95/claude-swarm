import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface GrillMeOptions {
  context?: string;
  model?: string;
  planDir?: string;
}

/**
 * Spawn Claude as an interactive terminal session with stdio: 'inherit'.
 * The user's terminal becomes the interview — stdin flows in, stdout flows out.
 * Returns the exit code when the session ends.
 */
function spawnInteractiveSession(prompt: string, model: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--model', model];

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', (err) => reject(err));
  });
}

async function executeGrillMe(topic: string, options: GrillMeOptions): Promise<void> {
  const model = options.model ?? 'claude-opus-4-6';

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

  const code = await spawnInteractiveSession(prompt, model);
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
  .action(executeGrillMe);
