import { describe, it, expect } from 'vitest';
import {
  getAgentDefinitions,
  getPromptTransport,
  getAgentShortLabel,
  appendSlugSuffix,
  buildAgentCommand,
  buildAgentLaunchOptions,
  buildInitialPromptCommand,
  buildResumeCommand,
  getDefaultEnabledAgents,
  getAgentSlugSuffix,
  getPermissionFlags,
  getSendKeysPostPasteDelayMs,
  getSendKeysPrePrompt,
  getSendKeysReadyDelayMs,
  getSendKeysSubmit,
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
    expect(getAgentSlugSuffix('gemini')).toBe('gemini');
  });

  it('returns default-enabled registry agents', () => {
    expect(getDefaultEnabledAgents()).toEqual(['claude', 'opencode', 'codex']);
  });

  it('builds single-agent options from available agents', () => {
    const options = buildAgentLaunchOptions(['claude', 'codex']);
    expect(options.map((option) => option.id)).toEqual([
      'claude',
      'codex',
    ]);
    expect(options[1]?.agents).toEqual(['codex']);
  });

  it('builds one option per available agent', () => {
    const options = buildAgentLaunchOptions(['claude', 'opencode', 'codex']);
    expect(options.map((option) => option.id)).toEqual([
      'claude',
      'opencode',
      'codex',
    ]);
  });

  it('uses 2-character short labels for all agents', () => {
    const definitions = getAgentDefinitions();
    for (const definition of definitions) {
      expect(getAgentShortLabel(definition.id)).toHaveLength(2);
    }
  });

  it('uses unique short labels for all agents', () => {
    const definitions = getAgentDefinitions();
    const labels = definitions.map((definition) => getAgentShortLabel(definition.id));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('getPermissionFlags', () => {
  describe('claude', () => {
    it('returns no flags for empty/default mode', () => {
      expect(getPermissionFlags('claude', '')).toBe('');
      expect(getPermissionFlags('claude', undefined)).toBe('');
    });

    it('returns plan mode flags', () => {
      expect(getPermissionFlags('claude', 'plan')).toBe('--permission-mode plan');
    });

    it('returns accept edits flags', () => {
      expect(getPermissionFlags('claude', 'acceptEdits')).toBe('--permission-mode acceptEdits');
    });

    it('returns bypass permissions flags', () => {
      expect(getPermissionFlags('claude', 'bypassPermissions')).toBe('--dangerously-skip-permissions');
    });
  });

  describe('codex', () => {
    it('returns no flags for empty/default mode', () => {
      expect(getPermissionFlags('codex', '')).toBe('');
      expect(getPermissionFlags('codex', undefined)).toBe('');
    });

    it('returns no flags for unsupported plan mode', () => {
      expect(getPermissionFlags('codex', 'plan')).toBe('');
    });

    it('returns accept edits flags', () => {
      expect(getPermissionFlags('codex', 'acceptEdits')).toBe('--full-auto');
    });

    it('returns bypass permissions flags', () => {
      expect(getPermissionFlags('codex', 'bypassPermissions')).toBe('--dangerously-bypass-approvals-and-sandbox');
    });
  });

  describe('opencode', () => {
    it('returns no flags for all modes', () => {
      expect(getPermissionFlags('opencode', '')).toBe('');
      expect(getPermissionFlags('opencode', undefined)).toBe('');
      expect(getPermissionFlags('opencode', 'plan')).toBe('');
      expect(getPermissionFlags('opencode', 'acceptEdits')).toBe('');
      expect(getPermissionFlags('opencode', 'bypassPermissions')).toBe('');
    });
  });

  describe('qwen', () => {
    it('returns plan/accept/bypass permission flags', () => {
      expect(getPermissionFlags('qwen', 'plan')).toBe('--approval-mode plan');
      expect(getPermissionFlags('qwen', 'acceptEdits')).toBe('--approval-mode auto-edit');
      expect(getPermissionFlags('qwen', 'bypassPermissions')).toBe('--approval-mode yolo');
    });
  });

  describe('gemini', () => {
    it('returns plan/accept/bypass permission flags', () => {
      expect(getPermissionFlags('gemini', 'plan')).toBe('--approval-mode plan');
      expect(getPermissionFlags('gemini', 'acceptEdits')).toBe('--approval-mode auto_edit');
      expect(getPermissionFlags('gemini', 'bypassPermissions')).toBe('--approval-mode yolo');
    });
  });
});

describe('command builders', () => {
  it('builds command without an initial prompt', () => {
    expect(buildAgentCommand('claude', 'acceptEdits')).toBe(
      'claude --permission-mode acceptEdits'
    );
  });

  it('builds option-style initial prompt command', () => {
    expect(buildInitialPromptCommand('copilot', '"fix it"', 'acceptEdits')).toBe(
      'copilot --allow-tool write -i "fix it"'
    );
  });

  it('builds stdin-style initial prompt command', () => {
    expect(buildInitialPromptCommand('amp', '"fix it"', 'bypassPermissions')).toBe(
      "printf '%s\\n' \"fix it\" | amp --dangerously-allow-all"
    );
  });

  it('uses send-keys startup mode for crush initial prompts', () => {
    expect(getPromptTransport('crush')).toBe('send-keys');
    expect(buildInitialPromptCommand('crush', '"fix it"', 'bypassPermissions')).toBe(
      'crush --yolo'
    );
    expect(getSendKeysPrePrompt('crush')).toEqual(['Escape', 'Tab']);
    expect(getSendKeysSubmit('crush')).toEqual(['Enter']);
    expect(getSendKeysPostPasteDelayMs('crush')).toBe(200);
    expect(getSendKeysReadyDelayMs('crush')).toBe(1200);
  });

  it('uses send-keys startup mode for cline initial prompts', () => {
    expect(getPromptTransport('cline')).toBe('send-keys');
    expect(buildInitialPromptCommand('cline', '"fix it"', 'acceptEdits')).toBe(
      'cline --act'
    );
    expect(getSendKeysPostPasteDelayMs('cline')).toBe(120);
    expect(getSendKeysReadyDelayMs('cline')).toBe(2500);
  });

  it('uses interactive prompt option for gemini', () => {
    expect(buildInitialPromptCommand('gemini', '"fix it"', 'bypassPermissions')).toBe(
      'gemini --approval-mode yolo --prompt-interactive "fix it"'
    );
  });

  it('builds gemini resume command', () => {
    expect(buildResumeCommand('gemini', 'bypassPermissions')).toBe(
      'gemini --resume latest --approval-mode yolo'
    );
  });
});
