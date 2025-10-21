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
  abortMerge: vi.fn(), // Add abortMerge mock
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

vi.mock('../../../src/actions/merge/conflictResolution.js', () => ({
  createConflictResolutionPaneForMerge: vi.fn(() =>
    Promise.resolve({
      type: 'navigation',
      title: 'Conflict Resolution Pane Created',
      message: 'AI agent will help resolve conflicts',
      targetPaneId: 'conflict-pane-1',
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

  describe('BUG #4: Runtime Conflict Detection', () => {
    it('should detect conflicts during Step 1 and offer resolution options', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      // Simulate a conflict occurring during actual merge (not caught by pre-validation)
      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['pnpm-lock.yaml'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      // Should offer AI/manual conflict resolution, not just show error
      expect(result.type).toBe('choice');
      expect(result.title).toContain('Conflict');
      expect(result.options?.map(o => o.id)).toContain('ai_merge');
      expect(result.options?.map(o => o.id)).toContain('manual_merge');
    });

    it('should show which files have conflicts', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['pnpm-lock.yaml', 'package.json'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('choice');
      if (result.type === 'choice') {
        expect(result.message).toContain('pnpm-lock.yaml');
        expect(result.message).toContain('package.json');
      }
    });

    it('should still show error for non-conflict merge failures', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      // Different kind of error (not a conflict)
      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Git command failed: permission denied',
        needsManualResolution: false,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      // Should show error for non-conflict failures
      expect(result.type).toBe('error');
      expect(result.message).toContain('permission denied');
    });

    it('should offer abort option for conflicts', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['test.txt'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('choice');
      if (result.type === 'choice') {
        expect(result.options?.map(o => o.id)).toContain('abort');
      }
    });

    it('should abort merge and clean up when abort option selected', async () => {
      const { mergeMainIntoWorktree, abortMerge } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['test.txt'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'choice' && result.onSelect) {
        const abortResult = await result.onSelect('abort');

        expect(abortMerge).toHaveBeenCalledWith(mockPane.worktreePath);
        expect(abortResult.type).toBe('info');
        expect(abortResult.message).toContain('aborted');
      }
    });

    it('should navigate to pane for manual resolution', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['test.txt'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'choice' && result.onSelect) {
        const manualResult = await result.onSelect('manual_merge');

        expect(manualResult.type).toBe('navigation');
        expect(manualResult.targetPaneId).toBe(mockPane.id);
        if (manualResult.type === 'navigation') {
          expect(manualResult.message).toContain('test.txt');
        }
      }
    });

    it('should create AI conflict resolution pane when AI merge selected', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');
      const { createConflictResolutionPaneForMerge } = await import(
        '../../../src/actions/merge/conflictResolution.js'
      );

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: ['test.txt'],
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'choice' && result.onSelect) {
        const aiResult = await result.onSelect('ai_merge');

        expect(createConflictResolutionPaneForMerge).toHaveBeenCalledWith(
          mockPane,
          mockContext,
          'main',
          '/test/main'
        );
        expect(aiResult.type).toBe('navigation');
        expect(aiResult.targetPaneId).toBe('conflict-pane-1');
      }
    });

    it('should truncate long conflict file lists in message', async () => {
      const { mergeMainIntoWorktree } = await import('../../../src/utils/mergeExecution.ts');

      const manyFiles = Array.from({ length: 10 }, (_, i) => `file${i}.txt`);

      vi.mocked(mergeMainIntoWorktree).mockReturnValue({
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles: manyFiles,
        needsManualResolution: true,
      });

      const result = await executeMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'choice') {
        // Should show first 5 files + "..."
        expect(result.message).toContain('file0.txt');
        expect(result.message).toContain('file4.txt');
        expect(result.message).toContain('...');
        expect(result.message).not.toContain('file9.txt');
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
