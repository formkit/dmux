import { describe, it, expect } from 'vitest';
import {
  appendSlugSuffix,
  buildAgentLaunchOptions,
  getAgentSlugSuffix,
} from '../src/utils/agentLaunch.js';

describe('agent launch utils', () => {
  it('appends normalized slug suffix once', () => {
    expect(appendSlugSuffix('feature-a', 'Claude Code')).toBe('feature-a-claude-code');
    expect(appendSlugSuffix('feature-a-claude-code', 'claude-code')).toBe('feature-a-claude-code');
  });

  it('returns per-agent slug suffixes', () => {
    expect(getAgentSlugSuffix('claude')).toBe('claude-code');
    expect(getAgentSlugSuffix('opencode')).toBe('opencode');
    expect(getAgentSlugSuffix('codex')).toBe('codex');
  });

  it('builds single and a/b options from available agents', () => {
    const options = buildAgentLaunchOptions(['claude', 'codex']);
    expect(options.map((option) => option.id)).toEqual([
      'claude',
      'codex',
      'claude+codex',
    ]);
    expect(options[2]?.agents).toEqual(['claude', 'codex']);
  });

  it('builds all pair combinations when 3 agents are available', () => {
    const options = buildAgentLaunchOptions(['claude', 'opencode', 'codex']);
    expect(options.map((option) => option.id)).toEqual([
      'claude',
      'opencode',
      'codex',
      'claude+opencode',
      'claude+codex',
      'opencode+codex',
    ]);
  });
});
