import { describe, it, expect } from 'vitest';
import {
  appendSlugSuffix,
  buildAgentLaunchOptions,
  getAgentSlugSuffix,
  getPermissionFlags,
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

describe('getPermissionFlags', () => {
  describe('claude', () => {
    it('returns no flags when permissionMode is empty (agent default)', () => {
      expect(getPermissionFlags('claude', '')).toBe('');
      expect(getPermissionFlags('claude', undefined)).toBe('');
    });

    it('returns acceptEdits flag', () => {
      expect(getPermissionFlags('claude', 'acceptEdits')).toBe('--permission-mode acceptEdits');
    });

    it('returns plan mode flag', () => {
      expect(getPermissionFlags('claude', 'plan')).toBe('--permission-mode plan');
    });

    it('returns dangerously-skip-permissions for bypassPermissions', () => {
      expect(getPermissionFlags('claude', 'bypassPermissions')).toBe('--dangerously-skip-permissions');
    });
  });

  describe('codex', () => {
    it('returns no flags when permissionMode is empty (agent default)', () => {
      expect(getPermissionFlags('codex', '')).toBe('');
      expect(getPermissionFlags('codex', undefined)).toBe('');
    });

    it('returns auto-edit flag for acceptEdits', () => {
      expect(getPermissionFlags('codex', 'acceptEdits')).toBe('--approval-mode auto-edit');
    });

    it('returns bypass flag for bypassPermissions', () => {
      expect(getPermissionFlags('codex', 'bypassPermissions')).toBe('--dangerously-bypass-approvals-and-sandbox');
    });

    it('returns no flags for modes codex does not support', () => {
      expect(getPermissionFlags('codex', 'plan')).toBe('');
    });
  });

  describe('opencode', () => {
    it('returns empty string for all modes', () => {
      expect(getPermissionFlags('opencode', '')).toBe('');
      expect(getPermissionFlags('opencode', undefined)).toBe('');
      expect(getPermissionFlags('opencode', 'plan')).toBe('');
      expect(getPermissionFlags('opencode', 'acceptEdits')).toBe('');
      expect(getPermissionFlags('opencode', 'bypassPermissions')).toBe('');
    });
  });
});
