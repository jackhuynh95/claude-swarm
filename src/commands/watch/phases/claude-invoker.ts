import { spawn } from 'node:child_process';
import type { PhaseConfig, PhaseResult, PhaseType, ClaudeModel } from '../types.js';
import { getPhaseConfig } from './model-router.js';

export interface InvokeOptions {
  prompt: string;
  config: PhaseConfig;
  autoMode?: boolean;
  cwd?: string;
  continueSession?: boolean;
}

/**
 * Spawn Claude CLI as child process with timeout enforcement.
 * SIGTERM -> 5s grace -> SIGKILL if still alive.
 */
export function invokeClaude(options: InvokeOptions): Promise<PhaseResult> {
  const { prompt, config, autoMode, cwd, continueSession } = options;
  const startTime = Date.now();

  const args = ['-p', prompt, '--model', config.model, '--output-format', 'text'];
  if (autoMode) args.push('--dangerously-skip-permissions');
  if (continueSession) args.push('--continue');

  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      cwd: cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exited = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    // Timeout: SIGTERM first, then SIGKILL after 5s if process hasn't exited
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!exited) proc.kill('SIGKILL');
      }, 5_000);
    }, config.timeoutMs);

    proc.on('close', (code) => {
      exited = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);

      resolve({
        phase: 'fix', // placeholder — caller sets real phase via invokeClaudePhase
        success: code === 0 && !timedOut,
        output: stdout,
        error: timedOut ? 'timeout' : (stderr || undefined),
        durationMs: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);

      resolve({
        phase: 'fix',
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Phase-aware wrapper: resolves PhaseConfig from model-router,
 * invokes Claude, and stamps the correct phase on the result.
 */
export async function invokeClaudePhase(
  prompt: string,
  phase: PhaseType,
  modelOverride?: ClaudeModel,
  autoMode?: boolean,
  cwd?: string,
): Promise<PhaseResult> {
  const config = getPhaseConfig(phase, modelOverride);
  const result = await invokeClaude({ prompt, config, autoMode, cwd });
  return { ...result, phase };
}
