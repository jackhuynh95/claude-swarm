import type { ClassifiedIssue, PhaseResult } from '../types.js';
import { invokeClaudePhase } from './claude-invoker.js';
import { addComment } from './label-manager.js';

export interface DesignReviewConfig {
  repo: string;
  autoMode: boolean;
  cwd?: string;
}

export interface DesignReviewResult {
  skipped: boolean;
  phaseResult: PhaseResult;
}

/**
 * Frontend design review — optional phase, only runs when flags.designReview is true.
 * Posts advisory comment. Never blocks pipeline, never transitions labels.
 */
export async function executeDesignReview(
  classified: ClassifiedIssue,
  config: DesignReviewConfig,
): Promise<DesignReviewResult> {
  if (!classified.flags.designReview) {
    const phaseResult: PhaseResult = {
      phase: 'design_review',
      success: true,
      output: 'Design review skipped — no frontend/ui label',
      durationMs: 0,
    };
    return { skipped: true, phaseResult };
  }

  try {
    const { issue } = classified;
    const prompt = buildDesignReviewPrompt(issue);

    const phaseResult = await invokeClaudePhase(
      prompt, 'design_review', classified.modelOverride, config.autoMode, config.cwd,
    );

    const comment = buildDesignComment(phaseResult.output ?? '', issue.number);
    await addComment(config.repo, issue.number, comment);

    return { skipped: false, phaseResult };
  } catch (err) {
    // Never block pipeline
    return {
      skipped: false,
      phaseResult: {
        phase: 'design_review',
        success: false,
        error: err instanceof Error ? err.message : 'unknown error',
        durationMs: 0,
      },
    };
  }
}

function buildDesignReviewPrompt(issue: { number: number; title: string }): string {
  return `Review the frontend/UI changes for issue #${issue.number}: ${issue.title}

Run \`git diff main...HEAD -- '*.tsx' '*.jsx' '*.css' '*.scss' '*.vue' '*.svelte'\`
to see UI-related changes.

Evaluate:
1. UI consistency with existing patterns
2. Responsiveness (mobile/tablet/desktop)
3. Accessibility (ARIA, keyboard nav, contrast)
4. Component composition (reuse vs duplication)
5. CSS/styling best practices

Format as a concise review. No verdict needed — this is advisory.`;
}

function buildDesignComment(output: string, issueNum: number): string {
  return `<!-- claude-swarm:design-review -->
🎨 **Design Review for #${issueNum}** _(advisory — does not block merge)_

${output}`;
}
