// Shared guard for Anthropic SDK calls made directly from the claude-swarm
// daemon/CLI (outside of spawned `claude` subprocesses).
//
// The SDK's default auth resolution only reads env vars — it does NOT inherit
// Claude Code's OAuth credentials. When a user is logged in via `claude login`
// only, direct `new Anthropic()` calls throw:
//   "Could not resolve authentication method. Expected either apiKey or
//   authToken to be set..."
//
// This module short-circuits those call sites cleanly when env auth is absent,
// emitting ONE informational log per module per process instead of repeated
// stack traces. Consumers must treat the absence of auth as a "skip silently"
// signal — never a hard failure — because this is a best-effort capture path.
//
// Follow-up: Option B (route classification through `claude` CLI subprocess)
// will restore capture under OAuth-only login. This guard is the v1.3.9 hotfix
// and does NOT restore capture — it only stops the misleading error noise.

/** True when the Anthropic SDK can authenticate via env alone. */
export function hasAnthropicEnvAuth(): boolean {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const authToken = process.env['ANTHROPIC_AUTH_TOKEN'];
  return Boolean((apiKey && apiKey.trim()) || (authToken && authToken.trim()));
}

// Track which modules have already emitted the warning this process.
const warnedModules = new Set<string>();

/**
 * Emit a one-time informational log explaining that this module's direct
 * Anthropic SDK calls are disabled because env auth is missing. Subsequent
 * calls from the same module are silent.
 *
 * @param moduleTag short prefix used in existing logs (e.g. "note-classifier")
 * @param featureDescription what is being skipped (e.g. "vault note classification")
 */
export function warnAuthUnavailableOnce(moduleTag: string, featureDescription: string): void {
  if (warnedModules.has(moduleTag)) return;
  warnedModules.add(moduleTag);
  console.log(
    `[${moduleTag}] ${featureDescription} disabled: no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in env. ` +
    `Claude Code OAuth login does not propagate to direct SDK calls — ` +
    `set one of those env vars to re-enable, or wait for Option B (OAuth-compatible capture path).`,
  );
}
