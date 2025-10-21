/**
 * Tests for merge issue handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleNothingToMerge,
  handleMainDirty,
  handleWorktreeUncommitted,
  handleMergeConflict,
} from '../../../src/actions/merge/issueHandlers/index.js';
import type { DmuxPane } from '../../../src/types.js';
import type { ActionContext } from '../../../src/actions/types.js';

// Mock utilities
vi.mock('../../../src/utils/mergeValidation.js', () => ({
  stashChanges: vi.fn(() => ({ success: true })),
  stageAllChanges: vi.fn(() => ({ success: true })),
  commitChanges: vi.fn(() => ({ success: true })),
}));

vi.mock('../../../src/utils/aiMerge.js', () => ({
  generateCommitMessage: vi.fn(() => Promise.resolve('feat: mock commit')),
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
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock the modules that conflict resolution and merge execution will import
vi.mock('../../../src/actions/merge/conflictResolution.js', () => ({
  createConflictResolutionPaneForMerge: vi.fn(() =>
    Promise.resolve({ type: 'navigation', message: 'Created conflict pane', targetPaneId: 'test', dismissable: true })
  ),
}));

vi.mock('../../../src/actions/merge/mergeExecution.js', () => ({
  executeMergeWithConflictHandling: vi.fn(() =>
    Promise.resolve({ type: 'success', message: 'Merge complete', dismissable: true })
  ),
}));

describe('Issue Handlers', () => {
  const mockPane: DmuxPane = {
    id: 'test-1',
    slug: 'test-branch',
    prompt: 'test prompt',
    paneId: '%1',
    worktreePath: '/test/worktree',
  };

  const mockContext: ActionContext = {
    projectName: 'test-project',
    panes: [mockPane],
    savePanes: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleNothingToMerge', () => {
    it('should return info result', () => {
      const result = handleNothingToMerge();

      expect(result.type).toBe('info');
      expect(result.message).toBe('No new commits to merge');
      expect(result.dismissable).toBe(true);
    });
  });

  describe('handleMainDirty', () => {
    const mockIssue = {
      type: 'main_dirty' as const,
      message: 'Main has uncommitted changes',
      files: ['file1.ts', 'file2.ts'],
    };

    const mockRetryMerge = vi.fn(() =>
      Promise.resolve({ type: 'success', message: 'Merged', dismissable: true })
    );

    it('should present commit options', async () => {
      const result = await handleMainDirty(
        mockIssue,
        'main',
        '/test/main',
        mockPane,
        mockContext,
        mockRetryMerge
      );

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Main Branch Has Uncommitted Changes');
      expect(result.options).toHaveLength(5);
      expect(result.options?.map(o => o.id)).toEqual([
        'commit_automatic',
        'commit_ai_editable',
        'commit_manual',
        'stash_main',
        'cancel',
      ]);
    });

    it('should handle cancel option', async () => {
      const result = await handleMainDirty(
        mockIssue,
        'main',
        '/test/main',
        mockPane,
        mockContext,
        mockRetryMerge
      );

      if (result.type === 'choice' && result.onSelect) {
        const cancelResult = await result.onSelect('cancel');
        expect(cancelResult.type).toBe('info');
        expect(cancelResult.message).toBe('Merge cancelled');
      }
    });

    it('should handle stash option', async () => {
      const { stashChanges } = await import('../../../src/utils/mergeValidation.js');
      vi.mocked(stashChanges).mockReturnValue({ success: true });

      const result = await handleMainDirty(
        mockIssue,
        'main',
        '/test/main',
        mockPane,
        mockContext,
        mockRetryMerge
      );

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('stash_main');
        expect(stashChanges).toHaveBeenCalledWith('/test/main');
        expect(mockRetryMerge).toHaveBeenCalled();
      }
    });

    it('should handle stash failure', async () => {
      const { stashChanges } = await import('../../../src/utils/mergeValidation.js');
      vi.mocked(stashChanges).mockReturnValue({ success: false, error: 'Stash failed' });

      const result = await handleMainDirty(
        mockIssue,
        'main',
        '/test/main',
        mockPane,
        mockContext,
        mockRetryMerge
      );

      if (result.type === 'choice' && result.onSelect) {
        const stashResult = await result.onSelect('stash_main');
        expect(stashResult.type).toBe('error');
        expect(stashResult.message).toContain('Stash failed');
      }
    });

    it('should handle commit options through commitMessageHandler', async () => {
      const result = await handleMainDirty(
        mockIssue,
        'main',
        '/test/main',
        mockPane,
        mockContext,
        mockRetryMerge
      );

      if (result.type === 'choice' && result.onSelect) {
        const commitResult = await result.onSelect('commit_automatic');
        // Should have called the commit handler which stages and commits
        expect(commitResult).toBeDefined();
      }
    });
  });

  describe('handleWorktreeUncommitted', () => {
    const mockIssue = {
      type: 'worktree_uncommitted' as const,
      message: 'Worktree has uncommitted changes',
      files: ['file1.ts', 'file2.ts'],
    };

    const mockRetryMerge = vi.fn(() =>
      Promise.resolve({ type: 'success', message: 'Merged', dismissable: true })
    );

    it('should present commit options', async () => {
      const result = await handleWorktreeUncommitted(mockIssue, mockPane, mockContext, mockRetryMerge);

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Worktree Has Uncommitted Changes');
      expect(result.options).toHaveLength(4);
      expect(result.options?.map(o => o.id)).toEqual([
        'commit_automatic',
        'commit_ai_editable',
        'commit_manual',
        'cancel',
      ]);
    });

    it('should handle cancel option', async () => {
      const result = await handleWorktreeUncommitted(mockIssue, mockPane, mockContext, mockRetryMerge);

      if (result.type === 'choice' && result.onSelect) {
        const cancelResult = await result.onSelect('cancel');
        expect(cancelResult.type).toBe('info');
        expect(cancelResult.message).toBe('Merge cancelled');
      }
    });

    it('should handle commit options through commitMessageHandler', async () => {
      const result = await handleWorktreeUncommitted(mockIssue, mockPane, mockContext, mockRetryMerge);

      if (result.type === 'choice' && result.onSelect) {
        const commitResult = await result.onSelect('commit_automatic');
        expect(commitResult).toBeDefined();
      }
    });
  });

  describe('handleMergeConflict', () => {
    const mockIssue = {
      type: 'merge_conflict' as const,
      message: 'Conflicts detected',
      files: ['conflict1.ts', 'conflict2.ts'],
    };

    it('should present conflict resolution options', async () => {
      const result = await handleMergeConflict(mockIssue, 'main', '/test/main', mockPane, mockContext);

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Merge Conflicts Detected');
      expect(result.options).toHaveLength(3);
      expect(result.options?.map(o => o.id)).toEqual(['ai_merge', 'manual_merge', 'cancel']);
    });

    it('should handle cancel option', async () => {
      const result = await handleMergeConflict(mockIssue, 'main', '/test/main', mockPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        const cancelResult = await result.onSelect('cancel');
        expect(cancelResult.type).toBe('info');
        expect(cancelResult.message).toBe('Merge cancelled');
      }
    });

    it('should handle manual merge option', async () => {
      const { executeMergeWithConflictHandling } = await import('../../../src/actions/merge/mergeExecution.js');

      const result = await handleMergeConflict(mockIssue, 'main', '/test/main', mockPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('manual_merge');
        expect(executeMergeWithConflictHandling).toHaveBeenCalledWith(
          mockPane,
          mockContext,
          'main',
          '/test/main',
          'manual'
        );
      }
    });

    it('should handle AI merge option', async () => {
      const { createConflictResolutionPaneForMerge } = await import(
        '../../../src/actions/merge/conflictResolution.js'
      );

      const result = await handleMergeConflict(mockIssue, 'main', '/test/main', mockPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('ai_merge');
        expect(createConflictResolutionPaneForMerge).toHaveBeenCalledWith(
          mockPane,
          mockContext,
          'main',
          '/test/main'
        );
      }
    });
  });
});
