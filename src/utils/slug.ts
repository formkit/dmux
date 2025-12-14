import { execSync } from 'child_process';
import { createProviderManagerFromEnv } from './aiProvider.js';

export const callClaudeCode = async (prompt: string): Promise<string | null> => {
  try {
    const result = execSync(
      `echo "${prompt.replace(/"/g, '\\"')}" | claude --no-interactive --max-turns 1 2>/dev/null | head -n 5`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      }
    );
    const lines = result.trim().split('\n');
    const response = lines.join(' ').trim();
    return response || null;
  } catch {
    return null;
  }
};

export const generateSlug = async (prompt: string): Promise<string> => {
  if (!prompt) return `dmux-${Date.now()}`;

  const providerManager = createProviderManagerFromEnv();

  if (providerManager.hasProviders()) {
    // Try AI providers first (OpenRouter or Mistral)
    const slugPrompt = `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${prompt}"`;

    const response = await providerManager.generateText(slugPrompt, {
      feature: 'slug',
      maxTokens: 10,
      temperature: 0.3
    });

    if (response) {
      const slug = response.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (slug) return slug;
    }
  }

  // Fallback to Claude Code CLI
  const claudeResponse = await callClaudeCode(
    `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${prompt}"`
  );
  if (claudeResponse) {
    const slug = claudeResponse.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) return slug;
  }

  return `dmux-${Date.now()}`;
};
