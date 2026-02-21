/**
 * Tests for openPr action and createPrFlow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openPr } from '../../src/actions/implementations/openPrAction.js';
import type { DmuxPane } from '../../src/types.js';
import type { ActionContext } from '../../src/actions/types.js';

// Mock dependencies
vi.mock('../../src/utils/ghCli.js', () => ({
  isGhAvailable: vi.fn(() => Promise.resolve(true)),
  isGhAuthenticated: vi.fn(() => Promise.resolve(true)),
  pushBranch: vi.fn(() => Promise.resolve({ success: true })),
  createPr: vi.fn(() =>
    Promise.resolve({ success: true, prNumber: 42, prUrl: 'https://github.com/test/repo/pull/42' })
  ),
  getExistingPr: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../src/utils/prDescription.js', () => ({
  generatePrDescription: vi.fn(() =>
    Promise.resolve({ title: 'feat: test PR', body: '## Summary\nTest changes' })
  ),
}));

vi.mock('../../src/utils/aiMerge.js', () => ({
  generateCommitMessage: vi.fn(() => Promise.resolve('feat: test commit')),
}));

vi.mock('../../src/utils/hooks.js', () => ({
  triggerHookSync: vi.fn(() => Promise.resolve({ success: true })),
  triggerHook: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

describe('openPr action', () => {
  const mockPane: DmuxPane = {
    id: 'test-1',
    slug: 'test-branch',
    prompt: 'test prompt',
    paneId: '%1',
    worktreePath: '/test/main/.dmux/worktrees/test-branch',
    agent: 'claude',
  };

  const mockContext: ActionContext = {
    projectName: 'test-project',
    sessionName: 'test-session',
    panes: [mockPane],
    savePanes: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no uncommitted changes, main branch detection succeeds
    mockExecSync.mockImplementation((command: string) => {
      const cmd = command.toString().trim();
      if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
        return 'refs/remotes/origin/main';
      }
      if (cmd.includes('git status --porcelain')) {
        return ''; // no uncommitted changes
      }
      if (cmd.includes('git log origin/test-branch..test-branch')) {
        return ''; // no new commits from hook
      }
      return '';
    });
  });

  describe('Validation', () => {
    it('should return error when pane has no worktree', async () => {
      const paneNoWorktree = { ...mockPane, worktreePath: undefined };
      const result = await openPr(paneNoWorktree, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('no worktree');
    });

    it('should return error when gh is not available', async () => {
      const { isGhAvailable } = await import('../../src/utils/ghCli.js');
      vi.mocked(isGhAvailable).mockResolvedValueOnce(false);

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('not installed');
    });

    it('should return error when gh is not authenticated', async () => {
      const { isGhAuthenticated } = await import('../../src/utils/ghCli.js');
      vi.mocked(isGhAuthenticated).mockResolvedValueOnce(false);

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('not authenticated');
    });

    it('should return error when branch is main', async () => {
      const mainPane = { ...mockPane, slug: 'main' };
      const result = await openPr(mainPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cannot create a PR from main to main');
    });

    it('should return info when PR already exists', async () => {
      const { getExistingPr } = await import('../../src/utils/ghCli.js');
      vi.mocked(getExistingPr).mockResolvedValueOnce({
        prNumber: 99,
        prUrl: 'https://github.com/test/repo/pull/99',
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('info');
      expect(result.message).toContain('PR #99');
    });
  });

  describe('Uncommitted changes', () => {
    it('should prompt to commit when there are uncommitted changes', async () => {
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return 'M src/file.ts';
        }
        return '';
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('confirm');
      expect(result.message).toContain('uncommitted changes');
      expect(result.onConfirm).toBeDefined();
    });

    it('should commit changes and continue to PR flow on confirm', async () => {
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return 'M src/file.ts';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          return '';
        }
        return '';
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('confirm');

      if (result.type === 'confirm' && result.onConfirm) {
        const prResult = await result.onConfirm();
        expect(prResult.type).toBe('success');
        expect(prResult.message).toContain('PR #42');
      }
    });
  });

  describe('createPrFlow - happy path', () => {
    it('should push, generate description, run hook, and create PR', async () => {
      const { pushBranch, createPr: createPrFn } = await import('../../src/utils/ghCli.js');
      const { generatePrDescription } = await import('../../src/utils/prDescription.js');
      const { triggerHookSync, triggerHook } = await import('../../src/utils/hooks.js');

      const result = await openPr(mockPane, mockContext);

      expect(result.type).toBe('success');
      expect(result.message).toContain('PR #42');
      expect(result.data).toEqual({ prNumber: 42, prUrl: 'https://github.com/test/repo/pull/42' });

      // Verify push was called
      expect(pushBranch).toHaveBeenCalledWith(mockPane.worktreePath, 'test-branch');

      // Verify description was generated
      expect(generatePrDescription).toHaveBeenCalledWith({
        panePrompt: 'test prompt',
        branch: 'test-branch',
        cwd: mockPane.worktreePath,
        projectRoot: '/test/main',
      });

      // Verify pre_pr hook was called with correct env vars (no `as any`)
      expect(triggerHookSync).toHaveBeenCalledWith(
        'pre_pr',
        '/test/main',
        mockPane,
        {
          DMUX_PR_TITLE: 'feat: test PR',
          DMUX_PR_BODY: '## Summary\nTest changes',
          DMUX_BASE_BRANCH: 'main',
        },
        600000,
      );

      // Verify PR was created
      expect(createPrFn).toHaveBeenCalledWith({
        cwd: '/test/main',
        title: 'feat: test PR',
        body: '## Summary\nTest changes',
        base: 'main',
        head: 'test-branch',
      });

      // Verify post_pr hook was called (no `as any`)
      expect(triggerHook).toHaveBeenCalledWith(
        'post_pr',
        '/test/main',
        mockPane,
        {
          DMUX_PR_NUMBER: '42',
          DMUX_PR_URL: 'https://github.com/test/repo/pull/42',
        },
      );

      // Verify panes were saved with PR info
      expect(mockContext.savePanes).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'test-1',
          prNumber: 42,
          prUrl: 'https://github.com/test/repo/pull/42',
          prStatus: 'open',
        }),
      ]);
    });
  });

  describe('createPrFlow - pre_pr hook with new commits', () => {
    it('should re-push and re-generate description when hook creates new commits', async () => {
      const { pushBranch } = await import('../../src/utils/ghCli.js');
      const { generatePrDescription } = await import('../../src/utils/prDescription.js');

      // First call returns v1, second call returns v2
      vi.mocked(generatePrDescription)
        .mockResolvedValueOnce({ title: 'feat: v1 title', body: 'v1 body' })
        .mockResolvedValueOnce({ title: 'feat: v2 with fixes', body: 'v2 body with review fixes' });

      // Hook creates new commits
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return '';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          return 'abc1234 fix(review): handle null edge case\ndef5678 fix(review): add input validation';
        }
        return '';
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('success');

      // Push should be called twice (initial + re-push after hook fixes)
      expect(pushBranch).toHaveBeenCalledTimes(2);

      // Description should be generated twice (v1 + v2)
      expect(generatePrDescription).toHaveBeenCalledTimes(2);

      // PR should be created with v2 (the re-generated description)
      const { createPr: createPrFn } = await import('../../src/utils/ghCli.js');
      expect(createPrFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'feat: v2 with fixes',
          body: 'v2 body with review fixes',
        }),
      );
    });

    it('should use original description when hook makes no new commits', async () => {
      const { pushBranch } = await import('../../src/utils/ghCli.js');
      const { generatePrDescription } = await import('../../src/utils/prDescription.js');

      vi.mocked(generatePrDescription).mockResolvedValueOnce({
        title: 'feat: original',
        body: 'original body',
      });

      // No new commits from hook
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return '';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          return ''; // empty = no new commits
        }
        return '';
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('success');

      // Push should only be called once
      expect(pushBranch).toHaveBeenCalledTimes(1);

      // Description should only be generated once
      expect(generatePrDescription).toHaveBeenCalledTimes(1);

      // PR created with original description
      const { createPr: createPrFn } = await import('../../src/utils/ghCli.js');
      expect(createPrFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'feat: original',
          body: 'original body',
        }),
      );
    });

    it('should handle git log failure gracefully when checking for new commits', async () => {
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return '';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          throw new Error('fatal: bad revision');
        }
        return '';
      });

      // Should still create PR successfully despite git log error
      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('success');
      expect(result.message).toContain('PR #42');
    });
  });

  describe('createPrFlow - pre_pr hook failure', () => {
    it('should return error when pre_pr hook fails', async () => {
      const { triggerHookSync } = await import('../../src/utils/hooks.js');
      vi.mocked(triggerHookSync).mockResolvedValueOnce({
        success: false,
        error: 'Review found critical issues',
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('pre_pr hook failed');
      expect(result.message).toContain('Review found critical issues');
    });

    it('should pass 600000ms timeout to pre_pr hook', async () => {
      const { triggerHookSync } = await import('../../src/utils/hooks.js');

      await openPr(mockPane, mockContext);

      expect(triggerHookSync).toHaveBeenCalledWith(
        'pre_pr',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        600000,
      );
    });
  });

  describe('createPrFlow - push failure', () => {
    it('should return error when initial push fails', async () => {
      const { pushBranch } = await import('../../src/utils/ghCli.js');
      vi.mocked(pushBranch).mockResolvedValueOnce({
        success: false,
        error: 'remote rejected',
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to push');
    });

    it('should return error when re-push after hook fails', async () => {
      const { pushBranch } = await import('../../src/utils/ghCli.js');

      // First push succeeds, second fails
      vi.mocked(pushBranch)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'rejected' });

      // Hook creates new commits (triggers re-push)
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          return 'refs/remotes/origin/main';
        }
        if (cmd.includes('git status --porcelain')) {
          return '';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          return 'abc1234 fix(review): some fix';
        }
        return '';
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to push review fixes');
    });
  });

  describe('createPrFlow - PR creation failure', () => {
    it('should return error when createPr fails', async () => {
      const { createPr: createPrFn } = await import('../../src/utils/ghCli.js');
      vi.mocked(createPrFn).mockResolvedValueOnce({
        success: false,
        error: 'repository not found',
      });

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to create PR');
    });
  });

  describe('Main branch detection', () => {
    it('should detect master as main branch', async () => {
      mockExecSync.mockImplementation((command: string) => {
        const cmd = command.toString().trim();
        if (cmd.includes('symbolic-ref refs/remotes/origin/HEAD')) {
          throw new Error('not found');
        }
        if (cmd.includes('rev-parse --verify main')) {
          throw new Error('not found');
        }
        if (cmd.includes('rev-parse --verify master')) {
          return 'abc123';
        }
        if (cmd.includes('git status --porcelain')) {
          return '';
        }
        if (cmd.includes('git log origin/test-branch..test-branch')) {
          return '';
        }
        return '';
      });

      const { triggerHookSync } = await import('../../src/utils/hooks.js');

      const result = await openPr(mockPane, mockContext);
      expect(result.type).toBe('success');

      // Verify base branch detected as master
      expect(triggerHookSync).toHaveBeenCalledWith(
        'pre_pr',
        expect.any(String),
        mockPane,
        expect.objectContaining({
          DMUX_BASE_BRANCH: 'master',
        }),
        600000,
      );
    });
  });
});
