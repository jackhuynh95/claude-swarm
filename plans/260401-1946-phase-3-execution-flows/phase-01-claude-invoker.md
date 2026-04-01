# Phase 01: Claude CLI Invoker

**Priority**: Critical (blocks all other phases)
**Status**: Complete

---

## Overview

Extract Claude CLI subprocess spawning into a shared module. Both debug-flow and ship-flow need to invoke `claude -p <prompt>` with model selection, effort level, timeout enforcement (SIGTERM -> 5s -> SIGKILL), and streaming output capture.

Ported from: `run_claude()` function in `fix-issue.sh:225-238` and `ship-issue.sh:229-245`.

## Context Links

- Types: `src/commands/watch/types.ts` (PhaseConfig, PhaseResult, ClaudeModel)
- Model router: `src/commands/watch/phases/model-router.ts` (getPhaseConfig)
- Source: `auto-claude/fix-issue.sh` lines 225-238 (run_claude function)

## Architecture

```
invokeClaudePhase(prompt, phaseConfig)
  │
  ├── Build CLI args: claude -p <prompt> --model <model> --output-format text
  │   ├── --dangerously-skip-permissions (if autoMode)
  │   └── --continue (resume context)
  │
  ├── spawn(claude, args) via child_process
  │
  ├── Collect stdout/stderr into buffer
  │
  ├── setTimeout(phaseConfig.timeoutMs)
  │   ├── SIGTERM
  │   ├── wait 5s
  │   └── SIGKILL (if still alive)
  │
  └── Return PhaseResult { success, output, durationMs }
```

## Related Code Files

**Create:**
- `src/commands/watch/phases/claude-invoker.ts`

**Read for context:**
- `src/commands/watch/types.ts`
- `src/commands/watch/phases/model-router.ts`

## Implementation Steps

1. Create `claude-invoker.ts` with `InvokeOptions` interface:
   ```ts
   interface InvokeOptions {
     prompt: string;
     config: PhaseConfig;
     autoMode?: boolean;  // --dangerously-skip-permissions
     cwd?: string;        // working directory (worktree path)
     continueSession?: boolean; // --continue flag
   }
   ```

2. Implement `invokeClaude(options: InvokeOptions): Promise<PhaseResult>`:
   - Build args array: `['-p', prompt, '--model', config.model, '--output-format', 'text']`
   - Add `--dangerously-skip-permissions` if autoMode
   - Add `--continue` if continueSession
   - Spawn via `child_process.spawn('claude', args, { cwd })`
   - Collect stdout chunks into string buffer
   - Collect stderr chunks into string buffer

3. Implement timeout with SIGTERM -> 5s -> SIGKILL:
   ```ts
   const timer = setTimeout(() => {
     proc.kill('SIGTERM');
     setTimeout(() => {
       if (!proc.killed) proc.kill('SIGKILL');
     }, 5000);
   }, config.timeoutMs);
   ```
   - Clear timer on process exit
   - If killed by timeout, set `PhaseResult.error = 'timeout'`

4. Return `PhaseResult`:
   - `phase`: passed in by caller
   - `success`: exit code === 0 && not timed out
   - `output`: stdout string
   - `error`: stderr or 'timeout'
   - `durationMs`: Date.now() delta

5. Export helper `invokeClaudePhase(prompt, phase, modelOverride?, autoMode?)`:
   - Calls `getPhaseConfig(phase, modelOverride)` internally
   - Wraps `invokeClaude` with phase-aware defaults

## Todo

- [x] Create `claude-invoker.ts` with InvokeOptions interface
- [x] Implement spawn + stdout/stderr collection
- [x] Implement SIGTERM -> 5s -> SIGKILL timeout
- [x] Return PhaseResult with timing + success/error
- [x] Export invokeClaudePhase helper
- [x] Verify `npm run build` compiles

## Success Criteria

- Spawns `claude` CLI as child process
- Timeout kills process gracefully (SIGTERM first)
- Force-kills after 5s if still alive (SIGKILL)
- Returns structured PhaseResult
- No hanging processes on timeout

## Risk Assessment

- **Claude CLI not installed**: Check at daemon startup, not per-invocation
- **Zombie processes**: SIGKILL as last resort prevents zombies
- **Large stdout**: Buffer in memory is fine for single-issue outputs (<10MB)

## Implementation Notes

- Fixed SIGKILL escalation bug: timeout now correctly escalates to SIGKILL after SIGTERM
- All process cleanup handled via proper cleanup handlers
- Module exports `invokeClaude()` and helper `invokeClaudePhase()`
