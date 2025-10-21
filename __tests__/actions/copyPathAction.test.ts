/**
 * Unit tests for copyPathAction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyPath } from '../../src/actions/implementations/copyPathAction.js';
import { createMockPane, createShellPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectSuccess, expectError, expectInfo } from '../helpers/actionAssertions.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('copyPathAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should copy worktree path to clipboard successfully', async () => {
    const mockPane = createMockPane({
      worktreePath: '/test/project/.dmux/worktrees/my-feature',
    });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await copyPath(mockPane, mockContext);

    // Verify clipboard copy command
    expect(execSync).toHaveBeenCalledWith(
      'echo "/test/project/.dmux/worktrees/my-feature" | pbcopy',
      { stdio: 'pipe' }
    );

    // Verify success result with path in message
    expectSuccess(result, '/test/project/.dmux/worktrees/my-feature');
  });

  it('should return error for shell pane without worktree', async () => {
    const mockPane = createShellPane();
    const mockContext = createMockContext([mockPane]);

    const result = await copyPath(mockPane, mockContext);

    expectError(result, 'no worktree');
  });

  it('should return error for pane without worktreePath', async () => {
    const mockPane = createMockPane({ worktreePath: undefined });
    const mockContext = createMockContext([mockPane]);

    const result = await copyPath(mockPane, mockContext);

    expectError(result, 'no worktree');
  });

  it('should fallback to info message when clipboard copy fails', async () => {
    const mockPane = createMockPane({
      worktreePath: '/test/path',
    });
    const mockContext = createMockContext([mockPane]);

    // Mock clipboard command failure
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('pbcopy not found');
    });

    const result = await copyPath(mockPane, mockContext);

    // Should still return success but as info (showing path instead of copying)
    expectInfo(result, '/test/path');
  });

  it('should handle paths with special characters', async () => {
    const mockPane = createMockPane({
      worktreePath: '/test/project name with spaces/.dmux/worktrees/my-feature',
    });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    await copyPath(mockPane, mockContext);

    // Verify path is properly quoted
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('project name with spaces'),
      { stdio: 'pipe' }
    );
  });

  it('should handle very long paths', async () => {
    const longPath = '/very/long/path/'.repeat(20) + 'worktree';
    const mockPane = createMockPane({ worktreePath: longPath });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await copyPath(mockPane, mockContext);

    expectSuccess(result);
    expect(result.message).toContain(longPath);
  });
});
