/**
 * Tests for merge execution - focusing on actual bugs
 * These tests verify the INTENDED behavior, not just the current implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMerge, executeMergeWithConflictHandling } from '../../../src/actions/merge/mergeExecution.js';
import type { DmuxPane } from '../../../src/types.js';
import type { ActionContext } from '../../../src/actions/types.js';

// Mock utilities
vi.mock('../../../src/utils/mergeExecution.ts', () => ({
  mergeMainIntoWorktree: vi.fn(() => ({ success: true })),
  mergeWorktreeIntoMain: vi.fn(() => ({ success: true })),
  cleanupAfterMerge: vi.fn(() => ({ success: true })),
  completeMerge: vi.fn(() => ({ success: true })),
}));

vi.mock('../../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn(() => Promise.resolve()),
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

describe('Merge Execution - Bug Fixes', () => {
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

  describe('BUG #1: 2-Phase Merge Missing', () => {
    it('should merge main into worktree BEFORE merging worktree into main', async () => {
      const { mergeMainIntoWorktree, mergeWorktreeIntoMain } = await import(
        '../../../src/utils/mergeExecution.ts'
      );

      await executeMerge(mockPane, mockContext, 'main', '/test/main');

      // CRITICAL: Must call mergeMainIntoWorktree FIRST
      expect(mergeMainIntoWorktree).toHaveBeenCalledWith('/test/main/.dmux/worktrees/test-branch', 'main');

      // THEN call mergeWorktreeIntoMain
      expect(mergeWorktreeIntoMain).toHaveBeenCalledWith('/test/main', 'test-branch');

      // Verify order: mergeMainIntoWorktree must be called BEFORE mergeWorktreeIntoMain
      const mainIntoWorktreeCall = vi.mocked(mergeMainIntoWorktree).mock.invocationCallOrder[0];
      const worktreeIntoMainCall = vi.mocked(mergeWorktreeIntoMain).mock.invocationCallOrder[0];

      expect(mainIntoWorktreeCall).toBeLessThan(worktreeIntoMainCall);
    });

    it('should handle errors from mergeMainIntoWorktree', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Failed to merge main into worktree',
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to merge main into worktree');
    });

    it('should not proceed to step 2 if step 1 fails', async () => {
      const { mergeMainIntoWorktree, mergeWorktreeIntoMain } = await import(
        '../../../src/utils/mergeExecution.ts'
      );

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Step 1 failed',
      });

      await executeMerge(mockPane, mockContext, 'main', '/test/main');

      // Should NOT call step 2 if step 1 fails
      expect(mergeWorktreeIntoMain).not.toHaveBeenCalled();
    });
  });

  describe('BUG #2: Cleanup Flow', () => {
    it('should cleanup worktree when user confirms', async () => {
      const { mergeMainIntoWorktree, mergeWorktreeIntoMain, cleanupAfterMerge } = await import(
        '../../../src/utils/mergeExecution.ts'
      );

      // Ensure both merge steps succeed
      vi.mocked(mergeMainIntoWorktree).mockReturnValue({ success: true });
      vi.mocked(mergeWorktreeIntoMain).mockReturnValue({ success: true });
      vi.mocked(cleanupAfterMerge).mockReturnValue({ success: true });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('confirm');
      expect(result.title).toBe('Merge Complete');

      // Simulate user clicking "Yes, close it"
      if (result.type === 'confirm' && result.onConfirm) {
        await result.onConfirm();

        expect(cleanupAfterMerge).toHaveBeenCalledWith(
          '/test/main',
          '/test/main/.dmux/worktrees/test-branch',
          'test-branch'
        );
      }
    });

    it('should handle cleanup failures gracefully', async () => {
      const { cleanupAfterMerge } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(cleanupAfterMerge).mockReturnValue({
        success: false,
        error: 'Failed to remove worktree',
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'confirm' && result.onConfirm) {
        const cleanupResult = await result.onConfirm();

        expect(cleanupResult.type).toBe('error');
        expect(cleanupResult.message).toContain('cleanup failed');
      }
    });

    it('should remove pane from context after successful cleanup', async () => {
      const { mergeMainIntoWorktree, mergeWorktreeIntoMain, cleanupAfterMerge } = await import(
        '../../../src/utils/mergeExecution.ts'
      );

      // Ensure all operations succeed
      vi.mocked(mergeMainIntoWorktree).mockReturnValue({ success: true });
      vi.mocked(mergeWorktreeIntoMain).mockReturnValue({ success: true });
      vi.mocked(cleanupAfterMerge).mockReturnValue({ success: true });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'confirm' && result.onConfirm) {
        await result.onConfirm();

        // Should remove pane from context
        expect(mockContext.savePanes).toHaveBeenCalledWith([]);
      }
    });
  });

  describe('Post-merge hooks', () => {
    it('should trigger post_merge hook after successful merge', async () => {
      const { mergeMainIntoWorktree, mergeWorktreeIntoMain } = await import(
        '../../../src/utils/mergeExecution.ts'
      );
      const { triggerHook } = await import('../../../src/utils/hooks.js');

      // Ensure both merge steps succeed
      vi.mocked(mergeMainIntoWorktree).mockReturnValue({ success: true });
      vi.mocked(mergeWorktreeIntoMain).mockReturnValue({ success: true });

      await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(triggerHook).toHaveBeenCalledWith('post_merge', '/test/main', mockPane, {
        DMUX_TARGET_BRANCH: 'main',
      });
    });

    it('should NOT trigger post_merge hook if merge fails', async () => {
      const { mergeWorktreeIntoMain } = await import('../../../src/utils/mergeExecution.ts');
      const { triggerHook } = await import('../../../src/utils/hooks.js');

      vi.mocked(mergeWorktreeIntoMain).mockReturnValue({
        success: false,
        error: 'Merge failed',
      });

      await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(triggerHook).not.toHaveBeenCalled();
    });
  });
});
