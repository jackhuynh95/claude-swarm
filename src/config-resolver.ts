import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PhaseModelConfig } from './commands/watch/types.js';

const CONFIG_FILE = '.claude-swarm.json';

export interface ProjectConfig {
  repo?: string;
  vault?: string;
  brain?: string;
  baseUrl?: string;
  interval?: number;
  maxPerHour?: number;
  auto?: boolean;
  redTeam?: boolean;
  useTeam?: boolean;
  models?: Record<string, PhaseModelConfig>;  // per-phase model+effort overrides
}

/**
 * Detect GitHub repo from git remote origin URL.
 * Supports HTTPS and SSH formats:
 *   https://github.com/owner/repo.git → owner/repo
 *   git@github.com:owner/repo.git    → owner/repo
 */
export function detectRepo(cwd?: string): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
    }).trim();

    // HTTPS: https://github.com/owner/repo.git
    const https = url.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (https) return https[1];

    // SSH: git@github.com:owner/repo.git
    const ssh = url.match(/github\.com:([^/]+\/[^/.]+)/);
    if (ssh) return ssh[1];
  } catch { /* not a git repo or no remote */ }
  return undefined;
}

/**
 * Load project config from .claude-swarm.json in cwd.
 * Returns empty config if file doesn't exist.
 */
export function loadProjectConfig(cwd?: string): ProjectConfig {
  const configPath = join(cwd ?? process.cwd(), CONFIG_FILE);
  if (!existsSync(configPath)) return {};

  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as ProjectConfig;
  } catch {
    console.warn(`[config] Failed to parse ${CONFIG_FILE}`);
    return {};
  }
}

/**
 * Resolve repo: CLI flag > config file > git remote auto-detect.
 */
export function resolveRepo(cliRepo?: string, cwd?: string): string | undefined {
  if (cliRepo) return cliRepo;
  const config = loadProjectConfig(cwd);
  if (config.repo) return config.repo;
  return detectRepo(cwd);
}
