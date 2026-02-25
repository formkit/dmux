import { describe, expect, it } from 'vitest';
import { generateSiblingSlugForTargetPane } from '../src/utils/attachAgent.js';

describe('generateSiblingSlugForTargetPane', () => {
  it('increments from existing attached-agent siblings', () => {
    const slug = generateSiblingSlugForTargetPane(
      { slug: 'cli-login', worktreePath: '/repo/.dmux/worktrees/cli-login' },
      [
        { slug: 'cli-login' },
        { slug: 'cli-login-a2' },
      ],
    );

    expect(slug).toBe('cli-login-a3');
  });

  it('uses worktree directory as base when attaching from a suffixed sibling', () => {
    const slug = generateSiblingSlugForTargetPane(
      { slug: 'cli-login-a2', worktreePath: '/repo/.dmux/worktrees/cli-login' },
      [
        { slug: 'cli-login' },
        { slug: 'cli-login-a2' },
      ],
    );

    expect(slug).toBe('cli-login-a3');
  });

  it('always uses highest sibling suffix + 1', () => {
    const slug = generateSiblingSlugForTargetPane(
      { slug: 'cli-login-a4', worktreePath: '/repo/.dmux/worktrees/cli-login' },
      [
        { slug: 'cli-login' },
        { slug: 'cli-login-a2' },
        { slug: 'cli-login-a4' },
      ],
    );

    expect(slug).toBe('cli-login-a5');
  });

  it('preserves legitimate branch/worktree names that end in -aN', () => {
    const slug = generateSiblingSlugForTargetPane(
      { slug: 'feature-a2', worktreePath: '/repo/.dmux/worktrees/feature-a2' },
      [{ slug: 'feature-a2' }],
    );

    expect(slug).toBe('feature-a2-a2');
  });
});
