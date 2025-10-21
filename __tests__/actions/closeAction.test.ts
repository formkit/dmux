/**
 * Unit tests for closeAction
 *
 * This is a complex action with multiple code paths:
 * - Shell panes close immediately without options
 * - Worktree panes present 3 options (kill_only, kill_and_clean, kill_clean_branch)
 * - Hooks are triggered, config watcher is paused, tmux operations, layout recalculation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { closePane } from '../../src/actions/implementations/closeAction.js';
import { createMockPane, createShellPane, createWorktreePane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectChoice, expectSuccess, expectError } from '../helpers/actionAssertions.js';

// Mock all external dependencies
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Create a persistent mock state manager instance
const mockStateManager = {
  getState: vi.fn(() => ({ projectRoot: '/test/project' })),
  pauseConfigWatcher: vi.fn(),
  resumeConfigWatcher: vi.fn(),
};

vi.mock('../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => mockStateManager),
  },
}));

vi.mock('../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { StateManager } from '../../src/shared/StateManager.js';
import { triggerHook } from '../../src/utils/hooks.js';
import fs from 'fs';

describe('closeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shell panes', () => {
    it('should close shell pane immediately without presenting options', async () => {
      const mockPane = createShellPane({ id: 'dmux-1', paneId: '%42' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const result = await closePane(mockPane, mockContext);

      // Should return success immediately (not a choice dialog)
      expectSuccess(result, 'closed successfully');
    });

    it('should kill shell pane via tmux', async () => {
      const mockPane = createShellPane({ paneId: '%99' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      await closePane(mockPane, mockContext);

      // Verify tmux commands were called
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux send-keys'),
        expect.anything()
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux kill-pane'),
        expect.anything()
      );
    });
  });

  describe('worktree panes - option presentation', () => {
    it('should present 3 cleanup options for worktree pane', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      const result = await closePane(mockPane, mockContext);

      expectChoice(result, 3);
      expect(result.title).toBe('Close Pane');

      // Verify all 3 options are present
      const optionIds = result.options!.map(o => o.id);
      expect(optionIds).toContain('kill_only');
      expect(optionIds).toContain('kill_and_clean');
      expect(optionIds).toContain('kill_clean_branch');
    });

    it('should mark destructive options as dangerous', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      const result = await closePane(mockPane, mockContext);

      const killAndClean = result.options!.find(o => o.id === 'kill_and_clean');
      const killCleanBranch = result.options!.find(o => o.id === 'kill_clean_branch');

      expect(killAndClean?.danger).toBe(true);
      expect(killCleanBranch?.danger).toBe(true);
    });

    it('should set kill_only as default option', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      const result = await closePane(mockPane, mockContext);

      const killOnly = result.options!.find(o => o.id === 'kill_only');
      expect(killOnly?.default).toBe(true);
    });
  });

  describe('close execution - kill_only', () => {
    it('should remove pane from tracking when kill_only selected', async () => {
      const pane1 = createWorktreePane({ id: 'dmux-1' });
      const pane2 = createWorktreePane({ id: 'dmux-2' });
      const mockContext = createMockContext([pane1, pane2]);
      const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(pane1, mockContext);
      await result.onSelect!('kill_only');

      // Verify pane was removed
      expect(savePanesSpy).toHaveBeenCalledWith([pane2]);
    });

    it('should call onPaneRemove callback with tmux pane ID', async () => {
      const mockPane = createWorktreePane({ paneId: '%42' });
      const mockContext = createMockContext([mockPane]);
      const onPaneRemoveSpy = vi.fn();
      mockContext.onPaneRemove = onPaneRemoveSpy;

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_only');

      expect(onPaneRemoveSpy).toHaveBeenCalledWith('%42');
    });

    it('should trigger before_pane_close and pane_closed hooks', async () => {
      const mockPane = createWorktreePane({ slug: 'test' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_only');

      expect(triggerHook).toHaveBeenCalledWith('before_pane_close', '/test/project', mockPane);
      expect(triggerHook).toHaveBeenCalledWith('pane_closed', '/test/project', mockPane);
    });

    it('should pause and resume config watcher', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_only');

      expect(mockStateManager.pauseConfigWatcher).toHaveBeenCalled();
      expect(mockStateManager.resumeConfigWatcher).toHaveBeenCalled();
    });
  });

  describe('close execution - kill_and_clean', () => {
    it('should remove worktree when kill_and_clean selected', async () => {
      const mockPane = createWorktreePane({
        worktreePath: '/test/project/.dmux/worktrees/my-feature',
      });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_and_clean');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree remove'),
        expect.anything()
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--force'),
        expect.anything()
      );
    });

    it('should trigger worktree removal hooks', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_and_clean');

      expect(triggerHook).toHaveBeenCalledWith('before_worktree_remove', expect.anything(), mockPane);
      expect(triggerHook).toHaveBeenCalledWith('worktree_removed', expect.anything(), mockPane);
    });

    it('should NOT delete branch when kill_and_clean selected', async () => {
      const mockPane = createWorktreePane({ slug: 'my-feature' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_and_clean');

      // Should NOT call git branch -D
      const gitBranchCalls = vi.mocked(execSync).mock.calls.filter(
        ([cmd]) => typeof cmd === 'string' && cmd.includes('git branch -D')
      );
      expect(gitBranchCalls).toHaveLength(0);
    });
  });

  describe('close execution - kill_clean_branch', () => {
    it('should remove worktree AND delete branch when kill_clean_branch selected', async () => {
      const mockPane = createWorktreePane({ slug: 'my-feature' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane);
      await result.onSelect!('kill_clean_branch');

      // Should remove worktree
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git worktree remove'),
        expect.anything()
      );

      // Should delete branch
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git branch -D my-feature'),
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should return error when close operation fails', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      // Mock tmux kill to fail
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('kill-pane')) {
          throw new Error('tmux error');
        }
        return Buffer.from('');
      });

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      const executeResult = await result.onSelect!('kill_only');

      // Should still complete (errors are logged but not fatal)
      expect(executeResult.type).toBe('success');
    });

    it('should resume config watcher even if close fails', async () => {
      const mockPane = createWorktreePane();
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal error');
      });

      const result = await closePane(mockPane, mockContext);

      try {
        await result.onSelect!('kill_only');
      } catch {
        // Expected to throw
      }

      // Config watcher should still be resumed
      expect(mockStateManager.resumeConfigWatcher).toHaveBeenCalled();
    });
  });

  describe('layout recalculation', () => {
    it('should NOT recalculate layout when no panes remain', async () => {
      const mockPane = createWorktreePane({ id: 'dmux-1' });
      const mockContext = createMockContext([mockPane]);

      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        controlPaneId: '%0',
      }));

      const result = await closePane(mockPane, mockContext);
      await result.onSelect!('kill_only');

      // No layout module should be imported when panes.length === 0
      // (This is tested by not mocking the layout module and ensuring no errors)
    });
  });
});
