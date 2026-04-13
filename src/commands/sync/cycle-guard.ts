// One-shot cycle lock utility — prevents pull→push chaining in sync pipeline.
// P5/P6 (watcher/builder) call acquireCycleLock before sync operations.
// All functions are best-effort and never throw.

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_FILE = '.sync-cycle-lock';
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 min — matches mtime window

interface LockData {
  operation: 'pull' | 'push';
  timestamp: number;
  pid: number;
}

/**
 * Acquire a cycle lock for the given operation.
 * Returns true (lock acquired) or false (denied — conflicting lock still active).
 * One-shot rule: a lock is denied only if an *opposite* operation locked within TTL.
 */
export async function acquireCycleLock(vaultPath: string, operation: 'pull' | 'push'): Promise<boolean> {
  const lockPath = join(vaultPath, LOCK_FILE);
  try {
    const raw = await readFile(lockPath, 'utf8').catch(() => null);
    if (raw) {
      const existing: LockData = JSON.parse(raw);
      const age = Date.now() - existing.timestamp;
      // Deny only if opposite operation locked within TTL
      if (existing.operation !== operation && age < LOCK_TTL_MS) {
        console.log(`[cycle-guard] denied: ${operation} — active ${existing.operation} lock (${Math.round(age / 1000)}s ago)`);
        return false;
      }
    }
    const lock: LockData = { operation, timestamp: Date.now(), pid: process.pid };
    await writeFile(lockPath, JSON.stringify(lock), 'utf8');
    return true;
  } catch {
    return true; // fail open — best-effort
  }
}

/** Release the cycle lock. Best-effort — ignores errors. */
export async function releaseCycleLock(vaultPath: string): Promise<void> {
  const lockPath = join(vaultPath, LOCK_FILE);
  await unlink(lockPath).catch(() => {});
}

/** Read-only check: is a cycle lock active? */
export async function isCycleLocked(vaultPath: string): Promise<{ locked: boolean; operation?: string }> {
  const lockPath = join(vaultPath, LOCK_FILE);
  try {
    const raw = await readFile(lockPath, 'utf8').catch(() => null);
    if (!raw) return { locked: false };
    const data: LockData = JSON.parse(raw);
    const age = Date.now() - data.timestamp;
    if (age >= LOCK_TTL_MS) return { locked: false }; // expired
    return { locked: true, operation: data.operation };
  } catch {
    return { locked: false };
  }
}
