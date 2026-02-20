import type { DmuxSettings } from '../types.js';

export type AgentName = 'claude' | 'opencode' | 'codex';

export interface AgentLaunchOption {
  id: string;
  label: string;
  agents: AgentName[];
  isPair: boolean;
}

const AGENT_LABELS: Record<AgentName, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
};

const AGENT_SLUG_SUFFIXES: Record<AgentName, string> = {
  claude: 'claude-code',
  opencode: 'opencode',
  codex: 'codex',
};

export function getAgentLabel(agent: AgentName): string {
  return AGENT_LABELS[agent];
}

export function getAgentSlugSuffix(agent: AgentName): string {
  return AGENT_SLUG_SUFFIXES[agent];
}

export function appendSlugSuffix(baseSlug: string, slugSuffix?: string): string {
  if (!slugSuffix) return baseSlug;

  const normalizedSuffix = slugSuffix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalizedSuffix) return baseSlug;
  if (baseSlug === normalizedSuffix || baseSlug.endsWith(`-${normalizedSuffix}`)) {
    return baseSlug;
  }

  return `${baseSlug}-${normalizedSuffix}`;
}

/**
 * Returns the CLI permission flags for a given agent and permission mode setting.
 * Empty string means the agent's true default (no flags — asks for permissions).
 * Config files default to 'acceptEdits' to preserve existing behavior.
 */
export function getPermissionFlags(
  agent: AgentName,
  permissionMode: DmuxSettings['permissionMode']
): string {
  const mode = permissionMode || '';

  if (agent === 'claude') {
    switch (mode) {
      case 'acceptEdits':
        return '--permission-mode acceptEdits';
      case 'plan':
        return '--permission-mode plan';
      case 'bypassPermissions':
        return '--dangerously-skip-permissions';
      default:
        return '';
    }
  }

  if (agent === 'codex') {
    switch (mode) {
      case 'acceptEdits':
        return '--approval-mode auto-edit';
      case 'bypassPermissions':
        return '--dangerously-bypass-approvals-and-sandbox';
      default:
        return '';
    }
  }

  // opencode has no permission flags
  return '';
}

export function buildAgentLaunchOptions(
  availableAgents: AgentName[]
): AgentLaunchOption[] {
  const uniqueAgents = availableAgents.filter(
    (agent, index) => availableAgents.indexOf(agent) === index
  );

  const singleAgentOptions: AgentLaunchOption[] = uniqueAgents.map((agent) => ({
    id: agent,
    label: getAgentLabel(agent),
    agents: [agent],
    isPair: false,
  }));

  const pairOptions: AgentLaunchOption[] = [];
  for (let i = 0; i < uniqueAgents.length; i++) {
    for (let j = i + 1; j < uniqueAgents.length; j++) {
      const first = uniqueAgents[i];
      const second = uniqueAgents[j];
      pairOptions.push({
        id: `${first}+${second}`,
        label: `A/B: ${getAgentLabel(first)} + ${getAgentLabel(second)}`,
        agents: [first, second],
        isPair: true,
      });
    }
  }

  return [...singleAgentOptions, ...pairOptions];
}
