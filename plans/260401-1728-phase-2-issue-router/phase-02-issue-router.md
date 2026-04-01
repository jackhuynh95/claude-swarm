# Phase 2: Issue Router

**Priority**: High
**Status**: Pending

---

## Overview

Create `issue-router.ts` — the classification brain. Parses issue title prefix + GitHub labels to determine flow type, model overrides, and smart flags.

## Context

- Types from `phase-01-types.md` (GHIssue → ClassifiedIssue)
- Roadmap tasks #8, #11, #12, #13

## Related Code Files

**Create:**
- `src/commands/watch/phases/issue-router.ts`

**Read:**
- `src/commands/watch/types.ts`

## Key Insights

- Title prefix is primary classifier: `[BUG]`, `[FEATURE]`, `[DOCS]`, `[CHORE]`
- GitHub labels are secondary: "hard", "frontend", "security", "bug", "feature", "documentation"
- Title prefix takes priority over labels (explicit > implicit)
- Unknown issues default to ship-flow (safer — plan first, then implement)

## Implementation Steps

1. Create `src/commands/watch/phases/issue-router.ts`:

```typescript
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

  return {
    hardMode: labelNames.has('hard'),
    designReview: labelNames.has('frontend') || labelNames.has('ui'),
    securityScan: labelNames.has('security'),
  };
}
```

2. Run `npm run build` to verify compilation

## Success Criteria

- [ ] `classifyIssue()` returns correct ClassifiedIssue
- [ ] `[BUG]` title → debug-flow
- [ ] `[FEATURE]` title → ship-flow
- [ ] `[DOCS]` / `[CHORE]` → ship-flow with `noTest: true`
- [ ] "hard" label → `modelOverride: 'opus'`
- [ ] "frontend" label → `flags.designReview: true`
- [ ] "security" label → `flags.securityScan: true`
- [ ] Title prefix overrides label-based detection
- [ ] Unknown issues default to ship-flow
