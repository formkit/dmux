/**
 * Unit tests for toggleAutopilotAction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleAutopilot } from '../../src/actions/implementations/toggleAutopilotAction.js';
import { createMockPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectSuccess, expectError } from '../helpers/actionAssertions.js';

describe('toggleAutopilotAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enable autopilot when currently disabled', async () => {
    const mockPane = createMockPane({ id: 'dmux-1', slug: 'test', autopilot: false });
    const mockContext = createMockContext([mockPane]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');
    const onPaneUpdateSpy = vi.fn();
    mockContext.onPaneUpdate = onPaneUpdateSpy;

    const result = await toggleAutopilot(mockPane, mockContext);

    // Verify panes were saved with autopilot enabled
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'dmux-1',
        autopilot: true,
      }),
    ]);

    // Verify onPaneUpdate callback
    expect(onPaneUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ autopilot: true })
    );

    // Verify success message
    expectSuccess(result, 'enabled');
    expect(result.message).toContain('test');
  });

  it('should disable autopilot when currently enabled', async () => {
    const mockPane = createMockPane({ id: 'dmux-1', slug: 'test', autopilot: true });
    const mockContext = createMockContext([mockPane]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

    const result = await toggleAutopilot(mockPane, mockContext);

    // Verify autopilot was disabled
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'dmux-1',
        autopilot: false,
      }),
    ]);

    expectSuccess(result, 'disabled');
  });

  it('should only update the specified pane in multi-pane context', async () => {
    const pane1 = createMockPane({ id: 'dmux-1', autopilot: false });
    const pane2 = createMockPane({ id: 'dmux-2', autopilot: true });
    const pane3 = createMockPane({ id: 'dmux-3', autopilot: false });
    const mockContext = createMockContext([pane1, pane2, pane3]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

    await toggleAutopilot(pane2, mockContext);

    // Verify only pane2's autopilot was toggled
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'dmux-1', autopilot: false }),
      expect.objectContaining({ id: 'dmux-2', autopilot: false }), // Toggled
      expect.objectContaining({ id: 'dmux-3', autopilot: false }),
    ]);
  });

  it('should handle savePanes errors gracefully', async () => {
    const mockPane = createMockPane({ autopilot: false });
    const mockContext = createMockContext([mockPane]);

    // Mock savePanes to throw error
    vi.spyOn(mockContext, 'savePanes').mockRejectedValue(new Error('Save failed'));

    const result = await toggleAutopilot(mockPane, mockContext);

    expectError(result, 'Save failed');
  });

  it('should work when onPaneUpdate callback is undefined', async () => {
    const mockPane = createMockPane({ autopilot: false });
    const mockContext = createMockContext([mockPane]);
    mockContext.onPaneUpdate = undefined;

    const result = await toggleAutopilot(mockPane, mockContext);

    // Should still succeed
    expectSuccess(result);
  });

  it('should handle undefined autopilot as false', async () => {
    const mockPane = createMockPane({ autopilot: undefined as any });
    const mockContext = createMockContext([mockPane]);
    const savePanesSpy = vi.spyOn(mockContext, 'savePanes');

    await toggleAutopilot(mockPane, mockContext);

    // undefined autopilot should be treated as false, so toggling enables it
    expect(savePanesSpy).toHaveBeenCalledWith([
      expect.objectContaining({ autopilot: true }),
    ]);
  });

  it('should include pane slug in result message', async () => {
    const mockPane = createMockPane({ slug: 'my-feature-branch', autopilot: false });
    const mockContext = createMockContext([mockPane]);

    const result = await toggleAutopilot(mockPane, mockContext);

    expect(result.message).toContain('my-feature-branch');
  });
});
