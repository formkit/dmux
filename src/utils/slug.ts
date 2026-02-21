import { callAgent } from './agentHarness.js';

export const generateSlug = async (prompt: string): Promise<string> => {
  if (!prompt) return `dmux-${Date.now()}`;

  const response = await callAgent(
    `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${prompt}"`,
    { timeout: 60000, cheap: true }
  );

  if (response) {
    const slug = response.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) return slug;
  }

  return `dmux-${Date.now()}`;
};
