/**
 * Integration tests for the simplified merge action
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergePane } from '../../../src/actions/implementations/mergeAction.js';
import type { DmuxPane } from '../../../src/types.js';
import type { ActionContext } from '../../../src/actions/types.js';

// Mock all dependencies
vi.mock('../../../src/utils/mergeValidation.js', () => ({
  validateMerge: vi.fn(() => ({
    canMerge: true,
    mainBranch: 'main',
    issues: [],
  })),
  stashChanges: vi.fn(() => ({ success: true })),
  stageAllChanges: vi.fn(() => ({ success: true })),
  commitChanges: vi.fn(() => ({ success: true })),
}));

vi.mock('../../../src/utils/mergeExecution.js', () => ({
  mergeMainIntoWorktree: vi.fn(() => ({ success: true })),
  mergeWorktreeIntoMain: vi.fn(() => ({ success: true })),
  cleanupAfterMerge: vi.fn(() => ({ success: true })),
}));

vi.mock('../../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../src/utils/worktreeDiscovery.js', () => ({
  detectAllWorktrees: vi.fn(() => ([
    {
      worktreePath: '/test/main/.dmux/worktrees/test-branch',
      parentRepoPath: '/test/main',
      branch: 'test-branch',
      repoName: 'main',
      relativePath: '.',
      depth: 0,
      isRoot: true,
    },
  ])),
}));

vi.mock('../../../src/actions/merge/multiMergeOrchestrator.js', () => ({
  buildMergeQueue: vi.fn(async (worktrees: any[]) =>
    worktrees.map((worktree) => ({
      worktree,
      validation: { canMerge: true, mainBranch: 'main', issues: [] },
    }))
  ),
  executeMultiMerge: vi.fn(async () => ({
    type: 'success',
    message: 'Multi-merge complete',
    dismissable: true,
  })),
}));

vi.mock('../../../src/actions/implementations/closeAction.js', () => ({
  closePane: vi.fn(() =>
    Promise.resolve({
      type: 'choice',
      title: 'Close Pane',
      options: [{ id: 'kill_only', label: 'Kill only' }],
      onSelect: vi.fn(() => Promise.resolve({ type: 'success', message: 'Closed', dismissable: true })),
      dismissable: true,
    })
  ),
}));

// Mock AI utilities
vi.mock('../../../src/utils/aiMerge.js', () => ({
  generateCommitMessage: vi.fn(() => Promise.resolve('feat: test commit')),
  getComprehensiveDiff: vi.fn(() => ({ diff: 'mock diff', summary: 'file1.ts' })),
}));

vi.mock('../../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      setDebugMessage: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('Merge Action Integration', () => {
  const mockPane: DmuxPane = {
    id: 'test-1',
    slug: 'test-branch',
    prompt: 'test prompt',
    paneId: '%1',
    worktreePath: '/test/main/.dmux/worktrees/test-branch',
  };

  const mockContext: ActionContext = {
    projectName: 'test-project',
    panes: [mockPane],
    savePanes: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy path - no issues', () => {
    it('should show merge confirmation when no issues detected', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');
      vi.mocked(validateMerge).mockReturnValue({
        canMerge: true,
        mainBranch: 'main',
        issues: [],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('confirm');
      expect(result.title).toBe('Merge Worktree');
      expect(result.message).toContain('test-branch');
      expect(result.message).toContain('main');
    });

    it('should trigger pre_merge hook on confirmation', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');
      const { triggerHook } = await import('../../../src/utils/hooks.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: true,
        mainBranch: 'main',
        issues: [],
      });

      const result = await mergePane(mockPane, mockContext);

      if (result.type === 'confirm' && result.onConfirm) {
        await result.onConfirm();
        expect(triggerHook).toHaveBeenCalledWith('pre_merge', '/test/main', mockPane, {
          DMUX_TARGET_BRANCH: 'main',
        });
      }
    });

    it('should return info on cancel', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: true,
        mainBranch: 'main',
        issues: [],
      });

      const result = await mergePane(mockPane, mockContext);

      if (result.type === 'confirm' && result.onCancel) {
        const cancelResult = await result.onCancel();
        expect(cancelResult.type).toBe('info');
        expect(cancelResult.message).toBe('Merge cancelled');
      }
    });
  });

  describe('Error cases', () => {
    it('should return error when pane has no worktree', async () => {
      const paneWithoutWorktree = { ...mockPane, worktreePath: undefined };

      const result = await mergePane(paneWithoutWorktree, mockContext);

      expect(result.type).toBe('error');
      expect(result.message).toContain('no worktree to merge');
    });
  });

  describe('Issue handling - nothing to merge', () => {
    it('should handle nothing_to_merge issue', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: false,
        mainBranch: 'main',
        issues: [
          {
            type: 'nothing_to_merge',
            message: 'No new commits',
            files: [],
          },
        ],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('info');
      expect(result.message).toBe('No new commits to merge');
    });
  });

  describe('Issue handling - main dirty', () => {
    it('should handle main_dirty issue with commit options', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: false,
        mainBranch: 'main',
        issues: [
          {
            type: 'main_dirty',
            message: 'Main has uncommitted changes',
            files: ['file1.ts', 'file2.ts'],
          },
        ],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Main Branch Has Uncommitted Changes');
      expect(result.options?.map(o => o.id)).toContain('commit_automatic');
      expect(result.options?.map(o => o.id)).toContain('stash_main');
    });
  });

  describe('Issue handling - worktree uncommitted', () => {
    it('should handle worktree_uncommitted issue', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: false,
        mainBranch: 'main',
        issues: [
          {
            type: 'worktree_uncommitted',
            message: 'Worktree has uncommitted changes',
            files: ['file1.ts'],
          },
        ],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Worktree Has Uncommitted Changes');
      expect(result.options?.map(o => o.id)).toContain('commit_automatic');
    });
  });

  describe('Issue handling - merge conflict', () => {
    it('should handle merge_conflict issue', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: false,
        mainBranch: 'main',
        issues: [
          {
            type: 'merge_conflict',
            message: 'Conflicts detected',
            files: ['conflict.ts'],
          },
        ],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Merge Conflicts Detected');
      expect(result.options?.map(o => o.id)).toContain('ai_merge');
      expect(result.options?.map(o => o.id)).toContain('manual_merge');
    });
  });

  describe('Generic issue handling', () => {
    it('should handle unknown issue types', async () => {
      const { validateMerge } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(validateMerge).mockReturnValue({
        canMerge: false,
        mainBranch: 'main',
        issues: [
          {
            type: 'unknown_issue',
            message: 'Something went wrong',
            files: [],
          },
        ],
      });

      const result = await mergePane(mockPane, mockContext);

      expect(result.type).toBe('error');
      expect(result.title).toBe('Merge Issues Detected');
      expect(result.message).toContain('Something went wrong');
    });
  });
});
