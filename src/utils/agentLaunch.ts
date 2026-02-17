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
