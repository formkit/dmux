/**
 * Unit tests for duplicateAction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { duplicatePane } from '../../src/actions/implementations/duplicateAction.js';
import { createMockPane } from '../fixtures/mockPanes.js';
import { createMockContext } from '../fixtures/mockContext.js';
import { expectConfirm, expectInfo } from '../helpers/actionAssertions.js';

describe('duplicateAction', () => {
  beforeEach(() => {
    // No mocks needed for this simple action
  });

  it('should return confirm dialog for duplication', async () => {
    const mockPane = createMockPane({ slug: 'test-pane' });
    const mockContext = createMockContext([mockPane]);

    const result = await duplicatePane(mockPane, mockContext);

    // Check it's a confirm dialog (but duplicatePane doesn't have onCancel)
    expect(result.type).toBe('confirm');
    expect(result.onConfirm).toBeDefined();
    expect(result.title).toBe('Duplicate Pane');
    expect(result.message).toContain('test-pane');
  });

  it('should include pane slug in confirmation message', async () => {
    const mockPane = createMockPane({ slug: 'my-feature' });
    const mockContext = createMockContext([mockPane]);

    const result = await duplicatePane(mockPane, mockContext);

    expect(result.message).toContain('my-feature');
  });

  it('should return info about not implemented when confirmed', async () => {
    const mockPane = createMockPane({
      prompt: 'original prompt',
      agent: 'claude',
    });
    const mockContext = createMockContext([mockPane]);

    const result = await duplicatePane(mockPane, mockContext);
    const confirmResult = await result.onConfirm!();

    expectInfo(confirmResult, 'not yet implemented');
  });

  it('should include action data for future implementation', async () => {
    const mockPane = createMockPane({
      prompt: 'test this feature',
      agent: 'opencode',
    });
    const mockContext = createMockContext([mockPane]);

    const result = await duplicatePane(mockPane, mockContext);
    const confirmResult = await result.onConfirm!();

    // Should include data that would be used for actual duplication
    expect(confirmResult.data).toEqual({
      action: 'create_pane',
      prompt: 'test this feature',
      agent: 'opencode',
    });
  });

  it('should have proper confirm and cancel labels', async () => {
    const mockPane = createMockPane();
    const mockContext = createMockContext([mockPane]);

    const result = await duplicatePane(mockPane, mockContext);

    expect(result.confirmLabel).toBe('Duplicate');
    expect(result.cancelLabel).toBe('Cancel');
  });
});
