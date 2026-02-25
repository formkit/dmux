import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildOpenRouterExportLine,
  getShellConfigCandidates,
  hasCompletedOpenRouterOnboarding,
  persistOpenRouterApiKeyToShell,
  readOnboardingState,
  upsertOpenRouterKeyBlock,
  writeOpenRouterOnboardingState,
} from '../src/utils/openRouterApiKeySetup.js';
import {
  getApiBaseUrl,
  getModelList,
  DEFAULT_API_URL,
  DEFAULT_MODELS,
} from '../src/config/apiConfig.js';

describe('openRouterApiKeySetup', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns shell config candidates for zsh', () => {
    const homeDir = '/tmp/example-home';
    const candidates = getShellConfigCandidates('/bin/zsh', homeDir);

    expect(candidates).toEqual([
      '/tmp/example-home/.zshrc',
      '/tmp/example-home/.zprofile',
    ]);
  });

  it('upserts managed block into empty content', () => {
    const exportLine = buildOpenRouterExportLine('sk-test-123', '/bin/zsh');
    const updated = upsertOpenRouterKeyBlock('', exportLine);

    expect(updated).toContain('# >>> dmux openrouter >>>');
    expect(updated).toContain("export OPENROUTER_API_KEY='sk-test-123'");
    expect(updated).toContain('# <<< dmux openrouter <<<');
  });

  it('replaces existing managed block', () => {
    const initial = [
      '# >>> dmux openrouter >>>',
      "export OPENROUTER_API_KEY='old-key'",
      '# <<< dmux openrouter <<<',
      '',
    ].join('\n');

    const nextLine = buildOpenRouterExportLine('new-key', '/bin/zsh');
    const updated = upsertOpenRouterKeyBlock(initial, nextLine);

    expect(updated).not.toContain('old-key');
    expect(updated).toContain("export OPENROUTER_API_KEY='new-key'");
  });

  it('persists key to shell config file', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-openrouter-'));

    try {
      const zshrcPath = join(homeDir, '.zshrc');
      writeFileSync(zshrcPath, '# existing config\n', 'utf-8');

      const result = await persistOpenRouterApiKeyToShell('sk-live-abc', {
        shellPath: '/bin/zsh',
        homeDir,
      });

      const content = readFileSync(result.shellConfigPath, 'utf-8');
      expect(result.shellConfigPath).toBe(zshrcPath);
      expect(content).toContain("export OPENROUTER_API_KEY='sk-live-abc'");
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('writes openrouter onboarding state without clobbering existing keys', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-openrouter-state-'));

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

      await writeOpenRouterOnboardingState(homeDir, 'configured', join(homeDir, '.zshrc'));

      const state = await readOnboardingState(homeDir);
      expect(state.tmuxConfigOnboarding).toBeDefined();
      expect(state.openRouterApiKeyOnboarding).toBeDefined();
      expect(await hasCompletedOpenRouterOnboarding(homeDir)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

describe('apiConfig - Environment Variables', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default API URL when OPENROUTER_BASE_URL is not set', () => {
    delete process.env.OPENROUTER_BASE_URL;
    expect(getApiBaseUrl()).toBe(DEFAULT_API_URL);
  });

  it('returns custom API URL when OPENROUTER_BASE_URL is set', () => {
    const customUrl = 'https://custom.api.example.com/v1/chat';
    process.env.OPENROUTER_BASE_URL = customUrl;
    expect(getApiBaseUrl()).toBe(customUrl);
  });

  it('returns default models when DMUX_MODELS is not set', () => {
    delete process.env.DMUX_MODELS;
    expect(getModelList()).toEqual(DEFAULT_MODELS);
  });

  it('returns custom models when DMUX_MODELS is set', () => {
    const customModels = 'model-a, model-b, model-c';
    process.env.DMUX_MODELS = customModels;
    expect(getModelList()).toEqual(['model-a', 'model-b', 'model-c']);
  });

  it('handles whitespace in custom models list', () => {
    const customModels = 'model-a  ,  model-b,  model-c  ';
    process.env.DMUX_MODELS = customModels;
    expect(getModelList()).toEqual(['model-a', 'model-b', 'model-c']);
  });

  it('filters empty strings from models list', () => {
    const customModels = 'model-a,,model-b,,';
    process.env.DMUX_MODELS = customModels;
    expect(getModelList()).toEqual(['model-a', 'model-b']);
  });

  it('returns empty array when DMUX_MODELS contains only whitespace', () => {
    process.env.DMUX_MODELS = '   ,  ,  ';
    expect(getModelList()).toEqual([]);
  });

  it('preserves model IDs with hyphens and colons', () => {
    const customModels = 'google/gemini-2.5-flash,x-ai/grok-4-fast:free,openai/gpt-4o-mini';
    process.env.DMUX_MODELS = customModels;
    expect(getModelList()).toEqual([
      'google/gemini-2.5-flash',
      'x-ai/grok-4-fast:free',
      'openai/gpt-4o-mini',
    ]);
  });

  it('supports custom endpoint configuration', () => {
    const customUrl = 'https://my-custom-endpoint.com/api/v1/chat/completions';
    process.env.OPENROUTER_BASE_URL = customUrl;
    const url = getApiBaseUrl();
    expect(url).toBe(customUrl);
    expect(url).not.toBe(DEFAULT_API_URL);
  });

  it('supports custom models configuration with single model', () => {
    const singleModel = 'custom/model-name';
    process.env.DMUX_MODELS = singleModel;
    expect(getModelList()).toEqual([singleModel]);
    expect(getModelList()).not.toEqual(DEFAULT_MODELS);
  });

  it('allows simultaneous configuration of custom endpoint and models', () => {
    const customUrl = 'https://custom.api.example.com/v1/chat';
    const customModels = 'custom-model-1,custom-model-2';
    process.env.OPENROUTER_BASE_URL = customUrl;
    process.env.DMUX_MODELS = customModels;
    
    expect(getApiBaseUrl()).toBe(customUrl);
    expect(getModelList()).toEqual(['custom-model-1', 'custom-model-2']);
  });
});