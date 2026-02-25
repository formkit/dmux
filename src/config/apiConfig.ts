/**
 * API configuration constants and helpers for external API interactions.
 *
 * Environment Variables:
 * - OPENROUTER_BASE_URL: Custom base URL for API requests (defaults to OpenRouter)
 * - DMUX_MODELS: Comma-separated list of model IDs to use (defaults to DEFAULT_MODELS)
 */

/**
 * Default API endpoint URL for OpenRouter chat completions API.
 */
export const DEFAULT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Default list of models to try when generating slugs, in order of preference.
 */
export const DEFAULT_MODELS = [
  'google/gemini-2.5-flash',
  'x-ai/grok-4-fast:free',
  'openai/gpt-4o-mini'
];

/**
 * Gets the API base URL from environment variables or returns the default.
 *
 * @returns The API base URL to use for requests
 *
 * @example
 * ```typescript
 * // With OPENROUTER_BASE_URL set
 * process.env.OPENROUTER_BASE_URL = 'https://custom.api.example.com/v1/chat';
 * const url = getApiBaseUrl(); // Returns 'https://custom.api.example.com/v1/chat'
 *
 * // Without OPENROUTER_BASE_URL set
 * const url = getApiBaseUrl(); // Returns 'https://openrouter.ai/api/v1/chat/completions'
 * ```
 */
export function getApiBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL || DEFAULT_API_URL;
}

/**
 * Gets the list of models from environment variables or returns the default list.
 *
 * Parses the DMUX_MODELS environment variable as a comma-separated list,
 * trimming whitespace and filtering out empty strings.
 *
 * @returns Array of model IDs to use
 *
 * @example
 * ```typescript
 * // With DMUX_MODELS set
 * process.env.DMUX_MODELS = 'model-a, model-b, model-c';
 * const models = getModelList(); // Returns ['model-a', 'model-b', 'model-c']
 *
 * // With whitespace handling
 * process.env.DMUX_MODELS = 'model-a  ,  model-b,';
 * const models = getModelList(); // Returns ['model-a', 'model-b']
 *
 * // Without DMUX_MODELS set
 * const models = getModelList(); // Returns DEFAULT_MODELS
 * ```
 */
export function getModelList(): string[] {
  const envModels = process.env.DMUX_MODELS;
  if (!envModels) {
    return DEFAULT_MODELS;
  }

  return envModels
    .split(',')
    .map(model => model.trim())
    .filter(model => model.length > 0);
}