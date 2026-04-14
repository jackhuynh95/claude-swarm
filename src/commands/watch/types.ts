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

/** Per-phase model+effort override from .claude-swarm.json */
export interface PhaseModelConfig {
  model?: ClaudeModel;
  effort?: EffortLevel;
}

/** Global CLI overrides — apply to ALL phases */
export interface ModelOverrides {
  model?: ClaudeModel;
  effort?: EffortLevel;
}

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
  | 'fix' | 'cook' | 'test' | 'e2e' | 'verify' | 'security'
  | 'security_review' | 'security_stride'
  | 'scout' | 'code_review'
  | 'scenario' | 'ui_test'
  | 'ship' | 'predict'
  | 'slack_read' | 'slack_report' | 'journal' | 'docs'
  | 'design_review'
  | 'retro' | 'watzup'
  | 'grill_me' | 'debrief';

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
  designReview: boolean;     // "frontend"/"ui" label
  securityScan: boolean;     // "security" label
  hardMode: boolean;         // "hard" label → opus override
  ciFailure: boolean;        // "ci"/"ci-failure"/"pipeline" label
  hasLogs: boolean;          // issue body contains log/stacktrace content
  quickFix: boolean;         // "quick"/"trivial"/"typo" label
  parallelBugs: boolean;     // "parallel"/"multi-bug" label or multiple bugs in body
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

// Task registry types (Phase 8)
export type ExitReason = 'completed' | 'error' | 'timeout' | 'budget_exceeded' | 'needs_refix';

export interface TaskMetadata {
  id: string;                // "run-{issueNum}-{timestamp}"
  issueNumber: number;
  issueTitle: string;
  role: FlowType;
  issueType: IssueType;
  state: IssueState;
  startedAt: string;         // ISO
  endedAt?: string;          // ISO
  exitReason?: ExitReason;
  exitMessage?: string;
  phases: PhaseResult[];
  artifacts: string[];
  costUsd?: number;
  resumable: boolean;
}
