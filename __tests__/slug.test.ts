import { describe, it, expect } from 'vitest';
import { generateSlug } from '../src/utils/slug.js';

describe('slug generation', () => {
  it('falls back to timestamp when no providers available', async () => {
    const slug = await generateSlug('');
    expect(slug.startsWith('dmux-')).toBe(true);
  });

  it('returns kebab-ish slug for prompt (or fallback)', async () => {
    const slug = await generateSlug('Refactor Dmux App');
    expect(typeof slug).toBe('string');
    expect(slug.length).toBeGreaterThan(0);
  });
});
