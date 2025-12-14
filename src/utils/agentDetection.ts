/**
 * Agent Detection Utilities
 *
 * Utilities to detect available AI agents (claude, opencode, vibe)
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
 * Find Mistral Vibe CLI command
 */
export async function findVibeCommand(): Promise<string | null> {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v vibe 2>/dev/null || which vibe 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    `${process.env.HOME}/.local/bin/vibe`,
    '/usr/local/bin/vibe',
    '/opt/homebrew/bin/vibe',
    '/usr/bin/vibe',
    `${process.env.HOME}/bin/vibe`,
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
export async function getAvailableAgents(): Promise<Array<'claude' | 'opencode' | 'vibe'>> {
  const agents: Array<'claude' | 'opencode' | 'vibe'> = [];

  if (await findClaudeCommand()) agents.push('claude');
  if (await findOpencodeCommand()) agents.push('opencode');
  if (await findVibeCommand()) agents.push('vibe');

  return agents;
}
