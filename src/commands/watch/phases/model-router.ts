import type { PhaseType, PhaseConfig, ClaudeModel } from '../types.js';

// Phase → default config (from agent-token-budget-guide.md)
const PHASE_CONFIGS: Record<PhaseType, PhaseConfig> = {
  brainstorm:   { model: 'opus',   effort: 'max',    maxTurns: 10, timeoutMs: 600_000, tools: ['Read', 'Grep', 'Glob'] },
  plan:         { model: 'opus',   effort: 'high',   maxTurns: 8,  timeoutMs: 480_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  plan_redteam: { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  debug:        { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  clarify:      { model: 'opus',   effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  fix:          { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'] },
  test:         { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  e2e:          { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Bash'] },
  verify:       { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  security:     { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  scout:        { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  code_review:  { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  scenario:     { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  ui_test:      { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  slack_read:   { model: 'opus',   effort: 'low',    maxTurns: 2,  timeoutMs: 60_000,  tools: ['Bash'] },
  slack_report: { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Bash'] },
  journal:      { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Write'] },
  docs:         { model: 'sonnet', effort: 'low',    maxTurns: 2,  timeoutMs: 120_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  design_review: { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
};

/**
 * Get phase config with optional model override.
 * Model override (from "hard" label) escalates model to opus.
 */
export function getPhaseConfig(
  phase: PhaseType,
  modelOverride?: ClaudeModel,
): PhaseConfig {
  const base = PHASE_CONFIGS[phase];
  if (!modelOverride) return base;

  return { ...base, model: modelOverride };
}

/**
 * Get all phase configs for a flow (debug or ship).
 * Returns ordered phase sequence.
 */
export function getFlowPhases(
  flowType: 'debug-flow' | 'ship-flow',
  noTest: boolean,
): PhaseType[] {
  if (flowType === 'debug-flow') {
    return ['debug', 'fix', 'test'];
  }

  // ship-flow
  const phases: PhaseType[] = ['plan', 'fix'];
  if (!noTest) phases.push('test');
  phases.push('scout', 'code_review');
  return phases;
}
