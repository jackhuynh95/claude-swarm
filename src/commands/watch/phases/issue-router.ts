import type { GHIssue, ClassifiedIssue, IssueType, FlowType, RouteFlags } from '../types.js';

// Title prefix patterns (case-insensitive)
const TITLE_PATTERNS: Array<{ pattern: RegExp; type: IssueType }> = [
  { pattern: /^\[BUG\]/i,     type: 'bug' },
  { pattern: /^\[FEATURE\]/i, type: 'feature' },
  { pattern: /^\[DOCS\]/i,    type: 'docs' },
  { pattern: /^\[CHORE\]/i,   type: 'chore' },
];

// Label → issue type fallback (when no title prefix)
const LABEL_TYPE_MAP: Record<string, IssueType> = {
  'bug': 'bug',
  'feature': 'feature',
  'enhancement': 'feature',
  'documentation': 'docs',
  'docs': 'docs',
  'chore': 'chore',
  'maintenance': 'chore',
};

// Issue type → flow type
const FLOW_MAP: Record<IssueType, FlowType> = {
  bug: 'debug-flow',
  feature: 'ship-flow',
  docs: 'ship-flow',
  chore: 'ship-flow',
  unknown: 'ship-flow',
};

// No-test types (skip test phase)
const NO_TEST_TYPES: Set<IssueType> = new Set(['docs', 'chore']);

export function classifyIssue(issue: GHIssue): ClassifiedIssue {
  const issueType = detectIssueType(issue);
  const flags = detectRouteFlags(issue);

  return {
    issue,
    issueType,
    flowType: FLOW_MAP[issueType],
    noTest: NO_TEST_TYPES.has(issueType),
    modelOverride: flags.hardMode ? 'opus' : undefined,
    flags,
    state: 'new',
  };
}

function detectIssueType(issue: GHIssue): IssueType {
  // 1. Title prefix (highest priority)
  for (const { pattern, type } of TITLE_PATTERNS) {
    if (pattern.test(issue.title)) return type;
  }

  // 2. GitHub labels (fallback)
  const labelNames = issue.labels.map(l => l.name.toLowerCase());
  for (const name of labelNames) {
    if (LABEL_TYPE_MAP[name]) return LABEL_TYPE_MAP[name];
  }

  return 'unknown';
}

function detectRouteFlags(issue: GHIssue): RouteFlags {
  const labelNames = new Set(issue.labels.map(l => l.name.toLowerCase()));
  const body = issue.body ?? '';

  return {
    hardMode: labelNames.has('hard'),
    designReview: labelNames.has('frontend') || labelNames.has('ui'),
    securityScan: labelNames.has('security'),
    ciFailure: labelNames.has('ci') || labelNames.has('ci-failure') || labelNames.has('pipeline'),
    hasLogs: /```[\s\S]{50,}```|stack\s?trace|at\s+\S+\s+\(|error\s+log/i.test(body),
    quickFix: labelNames.has('quick') || labelNames.has('trivial') || labelNames.has('typo'),
    parallelBugs: labelNames.has('parallel') || labelNames.has('multi-bug')
      || /multiple\s+(bugs?|issues?|errors?)/i.test(body),
  };
}
