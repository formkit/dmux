/**
 * Unit tests for renameAction
 * NOTE: Rename functionality is currently disabled because pane names are tied
 * to git worktree branches. These tests verify the disabled state.
 */

import { describe, it, expect } from 'vitest';
import { renamePane } from '../../src/actions/implementations/renameAction.js';
import { createMockPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectInfo } from '../helpers/actionAssertions.js';

describe('renameAction', () => {
  it('should return info message that rename is not supported', async () => {
    const mockPane = createMockPane({ slug: 'test-pane' });
    const mockContext = createMockContext([mockPane]);

    const result = await renamePane(mockPane, mockContext);

    // Should return info message explaining rename is disabled
    expectInfo(result, 'git worktree branches');
    expect(result.title).toBe('Rename Not Supported');
    expect(result.dismissable).toBe(true);
  });

  it('should return info message for any pane', async () => {
    const mockPane = createMockPane({ slug: 'another-pane', id: 'dmux-42' });
    const mockContext = createMockContext([mockPane]);

    const result = await renamePane(mockPane, mockContext);

    expect(result.type).toBe('info');
    expect(result.title).toBe('Rename Not Supported');
  });
});
