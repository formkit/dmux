/**
 * Agent Detection Utilities
 *
 * Utilities to detect available AI agents from the registry.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import {
  type AgentName,
  getAgentDefinition,
  getAgentDefinitions,
  resolveEnabledAgentsSelection,
} from './agentLaunch.js';

function resolveViaShell(testCommand: string): string | null {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "${testCommand}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0] || null;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Find an agent command path by registry ID.
 */
export async function findAgentCommand(agent: AgentName): Promise<string | null> {
  const definition = getAgentDefinition(agent);

  const fromPath = resolveViaShell(definition.installTestCommand);
  if (fromPath) return fromPath;

  for (const candidate of definition.commonPaths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Backward-compatible helpers used by merge flows and tests.
 */
export async function findClaudeCommand(): Promise<string | null> {
  return findAgentCommand('claude');
}

export async function findOpencodeCommand(): Promise<string | null> {
  return findAgentCommand('opencode');
}

export async function findCodexCommand(): Promise<string | null> {
  return findAgentCommand('codex');
}

/**
 * Get all installed agents (enabled + disabled).
 */
export async function getInstalledAgents(): Promise<AgentName[]> {
  const definitions = getAgentDefinitions();
  const checks = await Promise.all(
    definitions.map(async (definition) => ({
      id: definition.id,
      command: await findAgentCommand(definition.id),
    }))
  );

  return checks
    .filter((entry) => !!entry.command)
    .map((entry) => entry.id);
}

/**
 * Filter installed agents by settings-enabled list.
 */
export function filterEnabledAgents(
  installedAgents: AgentName[],
  enabledAgentsSetting: readonly string[] | undefined
): AgentName[] {
  const enabledAgents = new Set(resolveEnabledAgentsSelection(enabledAgentsSetting));
  return installedAgents.filter((agent) => enabledAgents.has(agent));
}

/**
 * Backward-compatible alias: returns installed agents.
 */
export async function getAvailableAgents(): Promise<AgentName[]> {
  return getInstalledAgents();
}
