/**
 * AI Provider Manager
 *
 * Manages AI API providers (OpenRouter and Mistral AI) for text generation
 */

/**
 * Options for text generation
 */
interface GenerateTextOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  feature?: string;
}

/**
 * Response structure from OpenRouter API
 */
interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Response structure from Mistral API
 */
interface MistralResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Provider manager interface
 */
interface ProviderManager {
  hasProviders(): boolean;
  generateText(prompt: string, options: GenerateTextOptions): Promise<string | null>;
}

/**
 * Get model configuration from environment variables for Mistral AI
 */
function getMistralModelForFeature(feature?: string): string {
  switch (feature) {
    case 'slug':
      return process.env.MISTRAL_SLUG_MODELS || 'mistral-small-latest';
    case 'commit':
      return process.env.MISTRAL_COMMIT_MODELS || 'mistral-small-latest';
    case 'analysis':
      return process.env.MISTRAL_ANALYSIS_MODELS || 'codestral-2501';
    default:
      return process.env.MISTRAL_DEFAULT_MODEL || 'mistral-small-latest';
  }
}

/**
 * Create a provider manager from environment variables
 * Supports both OpenRouter and Mistral AI APIs
 */
export function createProviderManagerFromEnv(): ProviderManager {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;

  return {
    hasProviders() {
      return !!openRouterKey || !!mistralKey;
    },

    async generateText(prompt: string, options: GenerateTextOptions) {
      // Try OpenRouter first if key is available
      if (openRouterKey) {
        const result = await tryOpenRouter(prompt, options, openRouterKey);
        if (result) return result;
      }

      // Fall back to Mistral AI if key is available
      if (mistralKey) {
        const result = await tryMistral(prompt, options, mistralKey);
        if (result) return result;
      }

      return null;
    }
  };
}

/**
 * Generic helper for AI API requests
 */
async function fetchAIResponse(
  url: string,
  model: string,
  apiKey: string,
  prompt: string,
  options: GenerateTextOptions,
  timeoutMs: number,
  defaults: { maxTokens?: number; temperature?: number } = {}
): Promise<{ success: boolean; content: string | null; error?: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.systemPrompt
          ? [
              { role: 'system', content: options.systemPrompt },
              { role: 'user', content: prompt }
            ]
          : [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json() as OpenRouterResponse;
      return { success: true, content: data.choices?.[0]?.message?.content?.trim() || null };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, content: null, error: { status: response.status, data: errorData } };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    return { success: false, content: null, error };
  }
}

/**
 * Try to generate text using OpenRouter API
 */
async function tryOpenRouter(
  prompt: string,
  options: GenerateTextOptions,
  apiKey: string
): Promise<string | null> {
  const models = ['google/gemini-2.5-flash', 'x-ai/grok-4-fast:free', 'openai/gpt-4o-mini'];

  for (const model of models) {
    const result = await fetchAIResponse('https://openrouter.ai/api/v1/chat/completions', model, apiKey, prompt, options, 12000);
    if (result.success && result.content) return result.content;
  }

  return null;
}

/**
 * Try to generate text using Mistral AI API
 * Uses HTTPS with certificate validation by default
 */
async function tryMistral(
  prompt: string,
  options: GenerateTextOptions,
  apiKey: string
): Promise<string | null> {
  const model = getMistralModelForFeature(options.feature);
  const result = await fetchAIResponse('https://api.mistral.ai/v1/chat/completions', model, apiKey, prompt, options, 15000, { maxTokens: 1024, temperature: 0.7 });

  if (result.success) {
    return result.content;
  } else {
    if (result.error) {
      console.error(`[Mistral API Error] Status: ${result.error.status}`, result.error.data);
    } else {
      console.error('[Mistral API Error]', result.error);
    }
    return null;
  }
}