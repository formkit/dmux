import { describe, expect, it } from 'vitest';
import { resolveAgentsToLaunchOnEnter } from '../src/components/popups/agentChoiceSelection.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

describe('resolveAgentsToLaunchOnEnter', () => {
  const availableAgents: AgentName[] = ['claude', 'codex', 'opencode'];

  it('launches focused agent when no agents are selected', () => {
    const result = resolveAgentsToLaunchOnEnter(
      availableAgents,
      new Set<AgentName>(),
      1
    );

    expect(result).toEqual(['codex']);
  });

  it('launches selected agents when one or more are selected', () => {
    const result = resolveAgentsToLaunchOnEnter(
      availableAgents,
      new Set<AgentName>(['opencode', 'claude']),
      1
    );

    // Preserve UI order, not set insertion order.
    expect(result).toEqual(['claude', 'opencode']);
  });

  it('returns empty when focus is out of range and nothing is selected', () => {
    const result = resolveAgentsToLaunchOnEnter(
      availableAgents,
      new Set<AgentName>(),
      999
    );

    expect(result).toEqual([]);
  });
});
