/**
 * Tests for conflict monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecSyncOptions } from 'child_process';

// Mock child_process with a spy
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Need to import after mocking
import { startConflictMonitoring } from '../../src/utils/conflictMonitor.js';
import { execSync as mockExecSync } from 'child_process';

describe('Conflict Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('startConflictMonitoring', () => {
    it('should start monitoring with default interval', () => {
      const onResolved = vi.fn();

      // Mock pane exists
      vi.mocked(mockExecSync).mockReturnValue('%99');

      const cleanup = startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
      });

      expect(typeof cleanup).toBe('function');
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should check pane existence on each interval', () => {
      const onResolved = vi.fn();

      // Mock pane exists and still in merge state
      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        if (cmd.includes('MERGE_HEAD')) {
          return Buffer.from('abc123'); // MERGE_HEAD exists
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
      });

      // Advance timer
      vi.advanceTimersByTime(2000);

      // Should check pane existence
      expect(vi.mocked(mockExecSync)).toHaveBeenCalledWith(
        expect.stringContaining('display-message -t'),
        expect.any(Object)
      );
    });

    it('should stop monitoring if pane is manually closed', async () => {
      const onResolved = vi.fn();

      // First check: pane exists
      // Second check: pane doesn't exist
      let checkCount = 0;
      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          checkCount++;
          if (checkCount > 1) {
            throw new Error("can't find pane");
          }
          return '%99';
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
      });

      // First check - pane exists
      await vi.advanceTimersByTimeAsync(1000);

      // Second check - pane doesn't exist, should stop
      await vi.advanceTimersByTimeAsync(1000);

      // Third check - shouldn't happen
      await vi.advanceTimersByTimeAsync(1000);

      expect(onResolved).not.toHaveBeenCalled();
      expect(checkCount).toBe(2);
    });

    it('should detect conflict resolution and trigger callback', async () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99'; // Pane exists
        }
        if (cmd.includes('MERGE_HEAD')) {
          throw new Error('MERGE_HEAD not found'); // Merge committed
        }
        if (cmd.includes('HEAD^2')) {
          return Buffer.from('def456'); // Is merge commit
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
      });

      // Advance timer to trigger check
      await vi.advanceTimersByTimeAsync(1000);

      expect(onResolved).toHaveBeenCalledTimes(1);
    });

    it('should not trigger callback if MERGE_HEAD still exists', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        if (cmd.includes('MERGE_HEAD')) {
          return Buffer.from('abc123'); // Still in merge state
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
      });

      vi.advanceTimersByTime(1000);

      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should not trigger callback if not a merge commit', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        if (cmd.includes('MERGE_HEAD')) {
          throw new Error('MERGE_HEAD not found'); // Merge committed or aborted
        }
        if (cmd.includes('HEAD^2')) {
          throw new Error('Not a merge commit'); // Not a merge commit
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
      });

      vi.advanceTimersByTime(1000);

      // Should not trigger - merge may have been aborted
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should stop monitoring after maxChecks', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        if (cmd.includes('MERGE_HEAD')) {
          return Buffer.from('abc123'); // Still in merge state
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
        maxChecks: 3,
      });

      // Advance through 3 checks
      vi.advanceTimersByTime(3000);

      const callsBefore = vi.mocked(mockExecSync).mock.calls.length;

      // Advance further - shouldn't check anymore
      vi.advanceTimersByTime(3000);

      const callsAfter = vi.mocked(mockExecSync).mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and not crash', () => {
      const onResolved = vi.fn();

      // Mock to always throw errors
      vi.mocked(mockExecSync).mockImplementation(() => {
        throw new Error('Simulated error');
      });

      // Should not throw when starting
      expect(() => {
        startConflictMonitoring({
          conflictPaneId: '%99',
          repoPath: '/test/repo',
          onResolved,
          checkIntervalMs: 1000,
        });
      }).not.toThrow();

      // Should not crash when errors occur during checks
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();

      // Callback should not be triggered when errors occur
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should allow manual cleanup via returned function', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        if (cmd.includes('MERGE_HEAD')) {
          return Buffer.from('abc123');
        }
        throw new Error('Command not found');
      });

      const cleanup = startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 1000,
      });

      // First check
      vi.advanceTimersByTime(1000);
      const callsBefore = vi.mocked(mockExecSync).mock.calls.length;

      // Call cleanup
      cleanup();

      // Advance timer - shouldn't check anymore
      vi.advanceTimersByTime(2000);
      const callsAfter = vi.mocked(mockExecSync).mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('should use custom check interval', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockReturnValue('%99');

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/test/repo',
        onResolved,
        checkIntervalMs: 5000, // Custom interval
      });

      // Advance by default interval - shouldn't check
      vi.advanceTimersByTime(2000);
      const callsBefore = vi.mocked(mockExecSync).mock.calls.length;

      // Advance by custom interval - should check
      vi.advanceTimersByTime(3000);
      const callsAfter = vi.mocked(mockExecSync).mock.calls.length;

      expect(callsAfter).toBeGreaterThan(callsBefore);
    });

    it('should pass correct repoPath to git commands', () => {
      const onResolved = vi.fn();

      vi.mocked(mockExecSync).mockImplementation((cmd: any, options: any) => {
        if (cmd.includes('display-message')) {
          return '%99';
        }
        // Check cwd is set correctly
        if (options?.cwd) {
          expect(options.cwd).toBe('/custom/repo/path');
        }
        throw new Error('Command not found');
      });

      startConflictMonitoring({
        conflictPaneId: '%99',
        repoPath: '/custom/repo/path',
        onResolved,
        checkIntervalMs: 1000,
      });

      vi.advanceTimersByTime(1000);
    });
  });
});
