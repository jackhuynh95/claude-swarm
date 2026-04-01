import chalk from 'chalk';

export type CapabilityStatus = 'implemented' | 'partial' | 'planned' | 'rejected';
export type CapabilitySource = 'ck-fork' | 'auto-claude' | 'new';

export interface CapabilityEntry {
  name: string;
  source: CapabilitySource;
  status: CapabilityStatus;
  phase: number;
}

export const CAPABILITIES: CapabilityEntry[] = [
  // Phase 1 — Daemon foundations
  { name: 'Daemon loop + GitHub poll',     source: 'ck-fork',      status: 'implemented', phase: 1 },
  { name: 'State persistence (JSON)',       source: 'ck-fork',      status: 'implemented', phase: 1 },
  { name: 'Label-based trigger filter',     source: 'ck-fork',      status: 'implemented', phase: 1 },

  // Phase 2 — Issue routing
  { name: 'Issue type classification',      source: 'auto-claude',  status: 'implemented', phase: 2 },
  { name: 'Flow routing (debug/ship)',       source: 'auto-claude',  status: 'implemented', phase: 2 },
  { name: 'Smart route flags (design/sec)', source: 'auto-claude',  status: 'implemented', phase: 2 },

  // Phase 3 — Core flows
  { name: 'Debug → fix → test loop',        source: 'auto-claude',  status: 'implemented', phase: 3 },
  { name: 'Ship flow (plan→code→PR)',        source: 'auto-claude',  status: 'implemented', phase: 3 },
  { name: 'Model router (effort-based)',     source: 'auto-claude',  status: 'implemented', phase: 3 },

  // Phase 4 — Post-ship phases
  { name: 'Verifier agent',                 source: 'new',          status: 'planned',     phase: 4 },
  { name: 'E2E testing phase',              source: 'new',          status: 'planned',     phase: 4 },
  { name: 'Security scan phase',            source: 'new',          status: 'partial',     phase: 4 },

  // Phase 5 — Multi-agent orchestration
  { name: 'Parallel subagent spawning',     source: 'auto-claude',  status: 'partial',     phase: 5 },
  { name: 'Agent result aggregation',       source: 'auto-claude',  status: 'partial',     phase: 5 },

  // Phase 6 — Safety & budgets
  { name: 'Per-issue invocation budget',    source: 'new',          status: 'implemented', phase: 6 },
  { name: 'Daily cost tracking',            source: 'new',          status: 'implemented', phase: 6 },
  { name: 'Conversation history',           source: 'new',          status: 'implemented', phase: 6 },
  { name: 'Nightly cost report',            source: 'new',          status: 'implemented', phase: 6 },

  // Phase 7 — Obsidian vault integration
  { name: 'Run recorder (markdown)',        source: 'new',          status: 'implemented', phase: 7 },
  { name: 'Obsidian journal writer',        source: 'new',          status: 'implemented', phase: 7 },
  { name: 'Context loader from vault',      source: 'new',          status: 'implemented', phase: 7 },

  // Phase 8 — Operator UX & observability
  { name: 'Task metadata registry',         source: 'new',          status: 'implemented', phase: 8 },
  { name: 'Operator status dashboard',      source: 'new',          status: 'implemented', phase: 8 },
  { name: 'Run history & resume index',     source: 'new',          status: 'implemented', phase: 8 },
  { name: 'Capability matrix',              source: 'new',          status: 'implemented', phase: 8 },
  { name: 'Searchable plan/run/review idx', source: 'new',          status: 'implemented', phase: 8 },
];

const STATUS_ICON: Record<CapabilityStatus, string> = {
  implemented: '✓',
  partial:     '◐',
  planned:     '○',
  rejected:    '✗',
};

function colorStatus(status: CapabilityStatus, icon: string): string {
  switch (status) {
    case 'implemented': return chalk.green(icon);
    case 'partial':     return chalk.yellow(icon);
    case 'planned':     return chalk.dim(icon);
    case 'rejected':    return chalk.red(icon);
  }
}

function colorSource(source: CapabilitySource): string {
  switch (source) {
    case 'ck-fork':     return chalk.cyan('ck-fork    ');
    case 'auto-claude': return chalk.magenta('auto-claude');
    case 'new':         return chalk.blue('new        ');
  }
}

/** Render the capability matrix as an aligned terminal table. */
export function renderMatrix(): string {
  const lines: string[] = [
    chalk.bold('▸ Capability Matrix'),
    `  ${chalk.dim('✓ implemented  ◐ partial  ○ planned  ✗ rejected')}`,
    '',
    `  ${'Capability'.padEnd(36)}${'Source'.padEnd(14)}${'Status'.padEnd(8)}Phase`,
    `  ${'─'.repeat(64)}`,
  ];

  for (const cap of CAPABILITIES) {
    const icon = colorStatus(cap.status, STATUS_ICON[cap.status]);
    const name = cap.name.padEnd(36);
    const src = colorSource(cap.source);
    lines.push(`  ${name}${src}  ${icon}       ${cap.phase}`);
  }

  return lines.join('\n');
}
