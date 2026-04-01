# Phase 06: Clarifier

**Priority**: Medium (new capability, not ported from auto-claude)
**Status**: Complete
**Depends on**: phase-01 (claude-invoker), phase-02 (label-manager)

---

## Overview

New phase not in auto-claude. Before executing a flow, Claude analyzes the issue spec and posts clarifying questions as an issue comment. The watcher then polls for a human reply before proceeding. This prevents wasted compute on underspecified issues.

Inserted into lifecycle: routing -> **clarifying** -> planning/debug -> implementing.

## Context Links

- Types: `src/commands/watch/types.ts` (IssueState has `clarifying`)
- State manager: `src/commands/watch/phases/state-manager.ts` (once wired)
- Labels: `phase-02-label-manager.md`

## Architecture

```
executeClarifyPhase(classified, config)
  │
  ├── 1. Analyze issue with Claude (opus, read-only)
  │   prompt: "Analyze this issue spec. If anything is ambiguous
  │            or underspecified, list questions. If clear, reply
  │            READY_TO_PROCEED."
  │
  ├── 2. Parse response:
  │   ├── Contains "READY_TO_PROCEED" → skip clarification, return ready
  │   └── Contains questions → post as issue comment
  │
  ├── 3. If questions posted:
  │   ├── Add "needs-clarification" label
  │   ├── Return { needsClarification: true, questions }
  │   └── Watcher will re-poll later
  │
  └── 4. On re-entry (after human reply):
      ├── Fetch latest comments since bot question
      ├── If human replied → return ready (remove label)
      └── If no reply → return still waiting
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/clarifier.ts`

**Read for context:**
- `src/commands/watch/phases/claude-invoker.ts` (from phase-01)
- `src/commands/watch/phases/label-manager.ts` (from phase-02)
- `src/commands/watch/types.ts`

## Implementation Steps

1. Create `clarifier.ts` with types:
   ```ts
   interface ClarifyResult {
     ready: boolean;              // true = proceed to flow
     questionsPosted: boolean;    // true = waiting for human
     questions?: string;          // the questions text
   }
   ```

2. Implement `analyzeClarityNeed(classified, autoMode)`:
   - Build prompt asking Claude to review issue for ambiguity
   - `invokeClaudePhase(prompt, 'clarify', classified.modelOverride, autoMode)`
   - Parse output: if contains `READY_TO_PROCEED` -> ready
   - Otherwise extract questions from output

3. Implement `postClarifyingQuestions(repo, issueNum, questions)`:
   - Format questions as GitHub comment with header
   - `addComment(repo, issueNum, formattedQuestions)`
   - `ensureLabelExists(repo, 'needs-clarification', ...)`
   - `transitionLabel(repo, issueNum, undefined, 'needs-clarification')`

4. Implement `checkForReply(repo, issueNum, sinceTimestamp)`:
   - `gh issue view <num> --json comments -R <repo>`
   - Filter comments after `sinceTimestamp`
   - Exclude bot comments (check for header marker)
   - If human reply found: remove `needs-clarification` label, return ready
   - If no reply: return not ready

5. Main export:
   ```ts
   export async function executeClarifyPhase(
     classified: ClassifiedIssue,
     config: { repo: string; autoMode: boolean },
     sinceTimestamp?: string,  // set on re-entry
   ): Promise<ClarifyResult>
   ```
   - First call (no sinceTimestamp): analyze + maybe post questions
   - Re-entry (with sinceTimestamp): check for reply

## Bot Comment Format

```markdown
**Clarification needed** before implementation:

1. [question 1]
2. [question 2]
3. [question 3]

---
*Please reply to this comment to unblock automated processing.*
<!-- claude-swarm:clarify -->
```

The HTML comment `<!-- claude-swarm:clarify -->` is the marker to identify bot questions when filtering.

## Todo

- [x] Create `clarifier.ts` with ClarifyResult type
- [x] Implement analyzeClarityNeed (Claude spec review)
- [x] Implement postClarifyingQuestions (GitHub comment)
- [x] Implement checkForReply (comment polling)
- [x] Main executeClarifyPhase with first-call vs re-entry logic
- [x] Verify `npm run build` compiles

## Success Criteria

- [x] Well-specified issues get `READY_TO_PROCEED` (no unnecessary delay)
- [x] Vague issues get clarifying questions posted as comment
- [x] `needs-clarification` label added/removed correctly
- [x] Bot identifies own comments vs human replies
- [x] Re-entry after human reply transitions to ready

## Risk Assessment

- **Over-asking questions**: Tune prompt to only ask when genuinely ambiguous. Include "If the issue is clear enough to implement, reply READY_TO_PROCEED."
- **Never getting a reply**: Watcher should have a configurable timeout (e.g. 48h) after which it proceeds anyway or marks as stale.
- **Comment API rate limits**: Single comment per clarify round, not per question.

## Implementation Notes

- Module exports `executeClarifyPhase()`
- Supports both first-call and re-entry logic via optional `sinceTimestamp` parameter
- Uses HTML comment marker `<!-- claude-swarm:clarify -->` to identify bot questions
- Proper label management for needs-clarification state transitions
