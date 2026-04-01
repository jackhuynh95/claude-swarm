// GitHub issue shape (from @octokit/rest response)
export interface GHIssue {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  state: 'open' | 'closed';
  assignee: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

// Issue classification
export type IssueType = 'bug' | 'feature' | 'docs' | 'chore' | 'unknown';
export type FlowType = 'debug-flow' | 'ship-flow';

// 14-state lifecycle
export type IssueState =
  | 'new' | 'brainstorming' | 'clarifying' | 'planning' | 'plan_posted'
  | 'awaiting_approval' | 'implementing' | 'testing'
  | 'verifying' | 'e2e_testing' | 'reporting' | 'journaling'
  | 'completed' | 'error' | 'timeout' | 'needs_refix';

// Model selection
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

// Phase configuration (from model-router)
export interface PhaseConfig {
  model: ClaudeModel;
  effort: EffortLevel;
  maxTurns: number;
  timeoutMs: number;
  tools: string[];
}

// Phase types (keys for model-router lookup)
export type PhaseType =
  | 'brainstorm' | 'plan' | 'plan_redteam' | 'debug' | 'clarify'
  | 'fix' | 'test' | 'e2e' | 'verify' | 'security'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review';

// Classified issue (output of issue-router)
export interface ClassifiedIssue {
  issue: GHIssue;
  issueType: IssueType;
  flowType: FlowType;
  noTest: boolean;           // true for docs/chore
  modelOverride?: ClaudeModel; // "hard" label → opus
  flags: RouteFlags;
  state: IssueState;
}

// Smart routing flags
export interface RouteFlags {
  designReview: boolean;     // "frontend" label
  securityScan: boolean;     // "security" label
  hardMode: boolean;         // "hard" label → opus override
}

// Per-issue budget limits for unattended runs
export interface BudgetConfig {
  maxInvocationsPerIssue: number;  // default: 20
  maxTokensPerIssue: number;       // default: 500_000
  enabled: boolean;                // default: true
}

// Safety feature configuration (paths default to cwd)
export interface SafetyConfig {
  budget: BudgetConfig;
  costTracking: boolean;
  historyPath?: string;   // default .ck-history.json
  budgetPath?: string;    // default .ck-budget.json
  costPath?: string;      // default .ck-costs.json
}

// Watch daemon config
export interface WatchConfig {
  repo: string;              // owner/repo
  intervalMs: number;
  maxPerHour: number;
  labels: {
    trigger: string;         // "ready_for_dev"
    shipped: string;
    verified: string;
    error: string;
  };
  safety?: SafetyConfig;
}

// Phase execution result
export interface PhaseResult {
  phase: PhaseType;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  artifacts?: string[];      // PR links, plan files, test results
}
