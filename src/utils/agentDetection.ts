/**
 * Agent Detection Utilities
 *
 * Utilities to detect available AI agents (claude, opencode)
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';

/**
 * Find Claude Code CLI command
 */
export async function findClaudeCommand(): Promise<string | null> {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v claude 2>/dev/null || which claude 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    `${process.env.HOME}/.claude/local/claude`,
    `${process.env.HOME}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    '/usr/bin/claude',
    `${process.env.HOME}/bin/claude`,
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
}

/**
 * Find OpenCode CLI command
 */
export async function findOpencodeCommand(): Promise<string | null> {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v opencode 2>/dev/null || which opencode 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
    `${process.env.HOME}/.local/bin/opencode`,
    `${process.env.HOME}/bin/opencode`,
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
}

/**
 * Find Codex CLI command
 */
export async function findCodexCommand(): Promise<string | null> {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v codex 2>/dev/null || which codex 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    `${process.env.HOME}/.local/bin/codex`,
    `${process.env.HOME}/bin/codex`,
    `${process.env.HOME}/.npm-global/bin/codex`,
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
}

/**
 * Get all available agents
 */
export async function getAvailableAgents(): Promise<Array<'claude' | 'opencode' | 'codex'>> {
  const agents: Array<'claude' | 'opencode' | 'codex'> = [];

  if (await findClaudeCommand()) agents.push('claude');
  if (await findOpencodeCommand()) agents.push('opencode');
  if (await findCodexCommand()) agents.push('codex');

  return agents;
}
