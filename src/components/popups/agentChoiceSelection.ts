import type { AgentName } from '../../utils/agentLaunch.js';

/**
 * Enter-key behavior for multi-agent popup:
 * - If at least one agent is selected, launch selected agents.
 * - If none are selected, launch the focused row.
 */
export function resolveAgentsToLaunchOnEnter(
  availableAgents: AgentName[],
  selectedAgents: ReadonlySet<AgentName>,
  focusedIndex: number
): AgentName[] {
  const orderedSelections = availableAgents.filter((agent) =>
    selectedAgents.has(agent)
  );

  if (orderedSelections.length > 0) {
    return orderedSelections;
  }

  const focusedAgent = availableAgents[focusedIndex];
  return focusedAgent ? [focusedAgent] : [];
}
