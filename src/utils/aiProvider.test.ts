import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProviderManagerFromEnv } from './aiProvider.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AI Provider Manager - Mistral Support', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_SLUG_MODELS;
    delete process.env.MISTRAL_COMMIT_MODELS;
    delete process.env.MISTRAL_ANALYSIS_MODELS;
  });

  it('should have providers when Mistral API key is set', () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';
    const provider = createProviderManagerFromEnv();
    expect(provider.hasProviders()).toBe(true);
  });

  it('should have providers when OpenRouter API key is set', () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    const provider = createProviderManagerFromEnv();
    expect(provider.hasProviders()).toBe(true);
  });

  it('should have providers when both API keys are set', () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    process.env.MISTRAL_API_KEY = 'mistral-test-key';
    const provider = createProviderManagerFromEnv();
    expect(provider.hasProviders()).toBe(true);
  });

  it('should not have providers when no API keys are set', () => {
    const provider = createProviderManagerFromEnv();
    expect(provider.hasProviders()).toBe(false);
  });

  it('should try OpenRouter first when both keys are available', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    // Mock successful OpenRouter response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'OpenRouter response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    const result = await provider.generateText('test prompt', {});

    expect(result).toBe('OpenRouter response');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('should fall back to Mistral when OpenRouter fails', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    // Mock failed OpenRouter responses for all models
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'OpenRouter failed' })
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'OpenRouter failed' })
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'OpenRouter failed' })
    });

    // Mock successful Mistral response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Mistral response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    const result = await provider.generateText('test prompt', {});

    expect(result).toBe('Mistral response');

    // Check that Mistral was called (should be the 4th call)
    const mistralCall = mockFetch.mock.calls[3];
    expect(mistralCall[0]).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(mistralCall[1]).toBeTypeOf('object');
  });

  it('should use Mistral when only Mistral key is available', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    // Mock successful Mistral response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Mistral response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    const result = await provider.generateText('test prompt', {});

    expect(result).toBe('Mistral response');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('should use default model when no feature-specific model is configured', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Mistral response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    await provider.generateText('test prompt', {});

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('mistral-small-latest'); // default model
  });

  it('should use feature-specific models when configured', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';
    process.env.MISTRAL_SLUG_MODELS = 'mistral-tiny';
    process.env.MISTRAL_COMMIT_MODELS = 'mistral-medium';
    process.env.MISTRAL_ANALYSIS_MODELS = 'codestral-2501';

    // Test slug feature
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'slug response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    await provider.generateText('test prompt', { feature: 'slug' });

    let call = mockFetch.mock.calls[0];
    let body = JSON.parse(call[1].body);
    expect(body.model).toBe('mistral-tiny');

    // Test commit feature
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'commit response' } }]
      })
    });

    await provider.generateText('test prompt', { feature: 'commit' });
    call = mockFetch.mock.calls[1];
    body = JSON.parse(call[1].body);
    expect(body.model).toBe('mistral-medium');

    // Test analysis feature
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'analysis response' } }]
      })
    });

    await provider.generateText('test prompt', { feature: 'analysis' });
    call = mockFetch.mock.calls[2];
    body = JSON.parse(call[1].body);
    expect(body.model).toBe('codestral-2501');
  });

  it('should handle Mistral API errors gracefully', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    // Mock failed Mistral response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid API key' })
    });

    const provider = createProviderManagerFromEnv();
    const result = await provider.generateText('test prompt', {});

    expect(result).toBeNull();
  });

  it('should handle network errors gracefully', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    // Mock network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const provider = createProviderManagerFromEnv();
    const result = await provider.generateText('test prompt', {});

    expect(result).toBeNull();
  });

  it('should use system prompt when provided', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'response with system prompt' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    await provider.generateText('user prompt', {
      systemPrompt: 'You are a helpful assistant'
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'user prompt' }
    ]);
  });

  it('should use default parameters when not specified', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    await provider.generateText('test prompt', {});

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.7);
  });

  it('should use custom parameters when specified', async () => {
    process.env.MISTRAL_API_KEY = 'mistral-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'response' } }]
      })
    });

    const provider = createProviderManagerFromEnv();
    await provider.generateText('test prompt', {
      maxTokens: 512,
      temperature: 0.3
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.3);
  });
});