/**
 * Unit tests for viewAction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { viewPane } from '../../src/actions/implementations/viewAction.js';
import { createMockPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectNavigation, expectError } from '../helpers/actionAssertions.js';
import { execSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('viewAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully jump to pane and return navigation result', async () => {
    const mockPane = createMockPane({
      id: 'dmux-1',
      slug: 'test-pane',
      paneId: '%42',
    });
    const mockContext = createMockContext([mockPane]);

    // Mock successful tmux command
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await viewPane(mockPane, mockContext);

    // Verify tmux command was called correctly
    expect(execSync).toHaveBeenCalledWith(
      `tmux select-pane -t '%42'`,
      { stdio: 'pipe' }
    );

    // Verify result
    expectNavigation(result, 'dmux-1');
    expect(result.message).toContain('test-pane');
    expect(result.dismissable).toBe(true);
  });

  it('should return error when pane selection fails', async () => {
    const mockPane = createMockPane({ paneId: '%99' });
    const mockContext = createMockContext([mockPane]);

    // Mock tmux command failure
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('can\'t find pane %99');
    });

    const result = await viewPane(mockPane, mockContext);

    // Verify error result
    expectError(result, 'closed');
    expect(result.dismissable).toBe(true);
  });

  it('should handle special characters in pane ID', async () => {
    const mockPane = createMockPane({ paneId: '%$special' });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    await viewPane(mockPane, mockContext);

    // Verify pane ID is properly quoted in tmux command
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("'%$special'"),
      { stdio: 'pipe' }
    );
  });

  it('should include pane slug in success message', async () => {
    const mockPane = createMockPane({ slug: 'my-feature-branch' });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await viewPane(mockPane, mockContext);

    expect(result.message).toContain('my-feature-branch');
  });

  it('should set correct target pane ID for navigation', async () => {
    const mockPane = createMockPane({ id: 'dmux-42' });
    const mockContext = createMockContext([mockPane]);

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await viewPane(mockPane, mockContext);

    expect(result.targetPaneId).toBe('dmux-42');
  });
});
