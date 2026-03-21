/**
 * AI Provider Configuration
 *
 * Centralized config for OpenAI-compatible API providers.
 *
 * Environment variables:
 *   OPENAI_API_KEY   - API key (falls back to OPENROUTER_API_KEY)
 *   OPENAI_BASE_URL  - Base URL (default: https://openrouter.ai/api/v1)
 *   OPENAI_MODEL     - Comma-separated model list for fallback
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODELS = [
  'google/gemini-2.5-flash',
  'x-ai/grok-4-fast:free',
  'openai/gpt-4o-mini',
];

export function getApiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    undefined
  );
}

export function getBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function getModels(): string[] {
  const raw = process.env.OPENAI_MODEL?.trim();
  if (raw) {
    const models = raw.split(',').map((m) => m.trim()).filter(Boolean);
    if (models.length > 0) return models;
  }
  return DEFAULT_MODELS;
}
