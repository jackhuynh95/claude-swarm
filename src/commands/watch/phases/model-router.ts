import type { PhaseType, PhaseConfig, ModelOverrides, PhaseModelConfig } from '../types.js';

// Phase → default config (from agent-token-budget-guide.md)
const PHASE_CONFIGS: Record<PhaseType, PhaseConfig> = {
  brainstorm:   { model: 'opus',   effort: 'max',    maxTurns: 10, timeoutMs: 600_000, tools: ['Read', 'Grep', 'Glob'] },
  plan:         { model: 'opus',   effort: 'high',   maxTurns: 8,  timeoutMs: 480_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  plan_redteam: { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  debug:        { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  clarify:      { model: 'opus',   effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  fix:          { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'] },
  cook:         { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'] },
  test:         { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  e2e:          { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Bash'] },
  verify:       { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  security:        { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  security_review: { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  security_stride: { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  scout:        { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  code_review:  { model: 'sonnet', effort: 'medium', maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  scenario:     { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  ui_test:      { model: 'sonnet', effort: 'low',    maxTurns: 3,  timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  ship:         { model: 'sonnet', effort: 'medium', maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  predict:      { model: 'opus',   effort: 'high',   maxTurns: 5,  timeoutMs: 300_000, tools: ['Read', 'Grep', 'Glob'] },
  slack_read:   { model: 'opus',   effort: 'low',    maxTurns: 2,  timeoutMs: 60_000,  tools: ['Bash'] },
  slack_report: { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Bash'] },
  journal:      { model: 'haiku',  effort: 'low',    maxTurns: 1,  timeoutMs: 30_000,  tools: ['Write'] },
  docs:         { model: 'sonnet', effort: 'low',    maxTurns: 2,  timeoutMs: 120_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  design_review: { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob'] },
  retro:    { model: 'sonnet', effort: 'medium', maxTurns: 3, timeoutMs: 180_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  watzup:   { model: 'sonnet', effort: 'low',    maxTurns: 2, timeoutMs: 120_000, tools: ['Read', 'Grep', 'Glob', 'Bash'] },
  grill_me: { model: 'opus',   effort: 'max',    maxTurns: 10, timeoutMs: 600_000, tools: ['Read', 'Grep', 'Glob'] },
};

/** Map config kebab-case keys → PhaseType values */
const CONFIG_KEY_MAP: Record<string, PhaseType> = {
  'brainstorm':      'brainstorm',
  'plan':            'plan',
  'plan-red-team':   'plan_redteam',
  'red-team':        'plan_redteam',
  'debug':           'debug',
  'clarify':         'clarify',
  'fix':             'fix',
  'cook':            'cook',
  'test':            'test',
  'e2e':             'e2e',
  'verify':          'verify',
  'security':        'security',
  'security-review': 'security_review',
  'security-stride': 'security_stride',
  'scout':           'scout',
  'code-review':     'code_review',
  'scenario':        'scenario',
  'ui-test':         'ui_test',
  'ship':            'ship',
  'predict':         'predict',
  'slack-read':      'slack_read',
  'slack-report':    'slack_report',
  'journal':         'journal',
  'docs':            'docs',
  'design-review':   'design_review',
  'retro':           'retro',
  'watzup':          'watzup',
  'grill-me':        'grill_me',
};

/**
 * Resolve phase config with 3-level override chain:
 *   CLI flags (global) > .claude-swarm.json (per-phase) > PHASE_CONFIGS (defaults)
 */
export function getPhaseConfig(
  phase: PhaseType,
  configModels?: Record<string, PhaseModelConfig>,
  cliOverrides?: ModelOverrides,
): PhaseConfig {
  // Level 1: defaults
  const base = { ...PHASE_CONFIGS[phase] };

  // Level 2: config file per-phase overrides
  if (configModels) {
    const configEntry = configModels[phase] ?? findConfigEntry(phase, configModels);
    if (configEntry) {
      if (configEntry.model) base.model = configEntry.model;
      if (configEntry.effort) base.effort = configEntry.effort;
    }
  }

  // Level 3: CLI global overrides (highest priority)
  if (cliOverrides?.model) base.model = cliOverrides.model;
  if (cliOverrides?.effort) base.effort = cliOverrides.effort;

  return base;
}

/** Reverse-lookup: find config entry for a PhaseType via CONFIG_KEY_MAP */
function findConfigEntry(
  phase: PhaseType,
  configModels: Record<string, PhaseModelConfig>,
): PhaseModelConfig | undefined {
  for (const [key, mappedPhase] of Object.entries(CONFIG_KEY_MAP)) {
    if (mappedPhase === phase && configModels[key]) return configModels[key];
  }
  return undefined;
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
