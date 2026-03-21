import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildAiExportLine,
  getShellConfigCandidates,
  hasCompletedAiProviderOnboarding,
  persistAiApiKeyToShell,
  readOnboardingState,
  upsertAiKeyBlock,
  writeAiProviderOnboardingState,
} from '../src/utils/aiApiKeySetup.js';

describe('aiApiKeySetup', () => {
  it('returns shell config candidates for zsh', () => {
    const homeDir = '/tmp/example-home';
    const candidates = getShellConfigCandidates('/bin/zsh', homeDir);

    expect(candidates).toEqual([
      '/tmp/example-home/.zshrc',
      '/tmp/example-home/.zprofile',
    ]);
  });

  it('upserts managed block into empty content', () => {
    const exportLine = buildAiExportLine('sk-test-123', '/bin/zsh');
    const updated = upsertAiKeyBlock('', exportLine);

    expect(updated).toContain('# >>> dmux ai-provider >>>');
    expect(updated).toContain("export OPENAI_API_KEY='sk-test-123'");
    expect(updated).toContain('# <<< dmux ai-provider <<<');
  });

  it('replaces existing managed block', () => {
    const initial = [
      '# >>> dmux ai-provider >>>',
      "export OPENAI_API_KEY='old-key'",
      '# <<< dmux ai-provider <<<',
      '',
    ].join('\n');

    const nextLine = buildAiExportLine('new-key', '/bin/zsh');
    const updated = upsertAiKeyBlock(initial, nextLine);

    expect(updated).not.toContain('old-key');
    expect(updated).toContain("export OPENAI_API_KEY='new-key'");
  });

  it('migrates legacy openrouter block to ai-provider block', () => {
    const initial = [
      '# existing config',
      '# >>> dmux openrouter >>>',
      "export OPENROUTER_API_KEY='old-key'",
      '# <<< dmux openrouter <<<',
      '',
    ].join('\n');

    const nextLine = buildAiExportLine('new-key', '/bin/zsh');
    const updated = upsertAiKeyBlock(initial, nextLine);

    expect(updated).not.toContain('dmux openrouter');
    expect(updated).not.toContain('OPENROUTER_API_KEY');
    expect(updated).toContain('# >>> dmux ai-provider >>>');
    expect(updated).toContain("export OPENAI_API_KEY='new-key'");
    expect(updated).toContain('# <<< dmux ai-provider <<<');
  });

  it('persists key to shell config file', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-ai-provider-'));

    try {
      const zshrcPath = join(homeDir, '.zshrc');
      writeFileSync(zshrcPath, '# existing config\n', 'utf-8');

      const result = await persistAiApiKeyToShell('sk-live-abc', {
        shellPath: '/bin/zsh',
        homeDir,
      });

      const content = readFileSync(result.shellConfigPath, 'utf-8');
      expect(result.shellConfigPath).toBe(zshrcPath);
      expect(content).toContain("export OPENAI_API_KEY='sk-live-abc'");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('writes onboarding state without clobbering existing keys', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-ai-provider-state-'));

    try {
      const onboardingDir = join(homeDir, '.dmux');
      mkdirSync(onboardingDir, { recursive: true });
      writeFileSync(
        join(onboardingDir, 'onboarding.json'),
        JSON.stringify(
          {
            tmuxConfigOnboarding: {
              completed: true,
              completedAt: '2025-01-01T00:00:00.000Z',
              outcome: 'skip',
            },
          },
          null,
          2
        ),
        'utf-8'
      );

      await writeAiProviderOnboardingState(homeDir, 'configured', join(homeDir, '.zshrc'));

      const state = await readOnboardingState(homeDir);
      expect(state.tmuxConfigOnboarding).toBeDefined();
      expect(state.aiProviderOnboarding).toBeDefined();
      expect(await hasCompletedAiProviderOnboarding(homeDir)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('detects legacy openrouter onboarding state as completed', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-ai-provider-legacy-'));

    try {
      const onboardingDir = join(homeDir, '.dmux');
      mkdirSync(onboardingDir, { recursive: true });
      writeFileSync(
        join(onboardingDir, 'onboarding.json'),
        JSON.stringify(
          {
            openRouterApiKeyOnboarding: {
              completed: true,
              completedAt: '2025-01-01T00:00:00.000Z',
              outcome: 'configured',
            },
          },
          null,
          2
        ),
        'utf-8'
      );

      expect(await hasCompletedAiProviderOnboarding(homeDir)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
