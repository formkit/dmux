/**
 * Unit tests for renameAction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renamePane } from '../../src/actions/implementations/renameAction.js';
import { createMockPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectInput, expectInfo, expectSuccess } from '../helpers/actionAssertions.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('renameAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return input dialog for rename', async () => {
    const mockPane = createMockPane({ slug: 'old-name' });
    const mockContext = createMockContext([mockPane]);

    const result = await renamePane(mockPane, mockContext);

    // Should return input dialog
    expectInput(result);
    expect(result.placeholder).toBe('old-name');
    expect(result.defaultValue).toBe('old-name');
    expect(result.title).toBe('Rename Pane');
  });

  it('should rename pane when valid name submitted', async () => {
    const mockPane = createMockPane({ id: 'dmux-1', slug: 'old-name', paneId: '%42' });
    const mockContext = createMockContext([mockPane]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');
    const onPaneUpdateSpy = vi.fn();
    mockContext.onPaneUpdate = onPaneUpdateSpy;

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await renamePane(mockPane, mockContext);

    // Submit new name
    const submitResult = await result.onSubmit!('new-name');

    // Verify tmux pane title was updated
    expect(execSync).toHaveBeenCalledWith(
      `tmux select-pane -t '%42' -T "new-name"`,
      { stdio: 'pipe' }
    );

    // Verify panes were saved with new name
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'dmux-1',
        slug: 'new-name',
      }),
    ]);

    // Verify onPaneUpdate callback was called
    expect(onPaneUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'new-name' })
    );

    // Verify success result
    expectSuccess(submitResult, 'new-name');
  });

  it('should return info when name unchanged', async () => {
    const mockPane = createMockPane({ slug: 'same-name' });
    const mockContext = createMockContext([mockPane]);

    const result = await renamePane(mockPane, mockContext);
    const submitResult = await result.onSubmit!('same-name');

    expectInfo(submitResult, 'cancelled');
  });

  it('should return info when empty name submitted', async () => {
    const mockPane = createMockPane({ slug: 'test' });
    const mockContext = createMockContext([mockPane]);

    const result = await renamePane(mockPane, mockContext);
    const submitResult = await result.onSubmit!('');

    expectInfo(submitResult, 'cancelled');
  });

  it('should handle tmux title update failure gracefully', async () => {
    const mockPane = createMockPane();
    const mockContext = createMockContext([mockPane]);

    // Mock tmux command failure (but we should still save the pane)
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('tmux error');
    });

    const result = await renamePane(mockPane, mockContext);
    const submitResult = await result.onSubmit!('new-name');

    // Should still succeed (tmux title is non-critical)
    expectSuccess(submitResult);
  });

  it('should update only the renamed pane in panes list', async () => {
    const pane1 = createMockPane({ id: 'dmux-1', slug: 'pane-1' });
    const pane2 = createMockPane({ id: 'dmux-2', slug: 'pane-2' });
    const mockContext = createMockContext([pane1, pane2]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await renamePane(pane1, mockContext);
    await result.onSubmit!('renamed-pane');

    // Verify only pane-1 was renamed
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'dmux-1', slug: 'renamed-pane' }),
      expect.objectContaining({ id: 'dmux-2', slug: 'pane-2' }),
    ]);
  });

  it('should accept names with leading/trailing whitespace', async () => {
    const mockPane = createMockPane({ slug: 'old' });
    const mockContext = createMockContext([mockPane]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

    vi.mocked(execSync).mockReturnValue(Buffer.from(''));

    const result = await renamePane(mockPane, mockContext);
    const submitResult = await result.onSubmit!('  new-name  ');

    // Action doesn't trim - it saves exactly what user provides
    expect(submitResult.type).toBe('success');
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({ slug: '  new-name  ' }),
    ]);
  });
});
