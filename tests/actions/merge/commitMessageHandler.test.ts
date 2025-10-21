/**
 * Tests for commit message handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCommitMessageSafe,
  promptForCommitMessage,
  handleCommitWithOptions,
} from '../../../src/actions/merge/commitMessageHandler.js';
import type { ActionResult } from '../../../src/actions/types.js';

// Mock the imported modules
vi.mock('../../../src/utils/aiMerge.js', () => ({
  generateCommitMessage: vi.fn(),
  getComprehensiveDiff: vi.fn(() => ({
    diff: 'mock diff',
    summary: 'file1.ts\nfile2.ts'
  })),
}));

vi.mock('../../../src/utils/mergeValidation.js', () => ({
  stageAllChanges: vi.fn(() => ({ success: true })),
  commitChanges: vi.fn(() => ({ success: true })),
}));

vi.mock('../../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      setDebugMessage: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe('commitMessageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateCommitMessageSafe', () => {
    it('should return generated commit message on success', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: add new feature');

      const result = await generateCommitMessageSafe('/test/repo');

      expect(result).toBe('feat: add new feature');
      expect(generateCommitMessage).toHaveBeenCalledWith('/test/repo');
    });

    it('should return null on timeout', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      // Simulate a slow response that exceeds timeout
      vi.mocked(generateCommitMessage).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('too late'), 20000))
      );

      const result = await generateCommitMessageSafe('/test/repo', 100); // 100ms timeout

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockRejectedValue(new Error('API error'));

      const result = await generateCommitMessageSafe('/test/repo');

      expect(result).toBeNull();
    });

    it('should return null when AI returns null', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockResolvedValue(null);

      const result = await generateCommitMessageSafe('/test/repo');

      expect(result).toBeNull();
    });
  });

  describe('promptForCommitMessage', () => {
    it('should return manual input prompt when mode is manual', async () => {
      const mockCallback = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await promptForCommitMessage('/test/repo', 'manual', mockCallback);

      expect(result.type).toBe('input');
      expect(result.title).toBe('Enter Commit Message');
      expect(result.message).toContain('Write a commit message');
    });

    it('should handle empty message validation in manual mode', async () => {
      const mockCallback = vi.fn();

      const result = await promptForCommitMessage('/test/repo', 'manual', mockCallback);

      expect(result.type).toBe('input');
      if (result.type === 'input' && result.onSubmit) {
        const errorResult = await result.onSubmit('');
        expect(errorResult.type).toBe('error');
        expect(errorResult.message).toContain('cannot be empty');
        expect(mockCallback).not.toHaveBeenCalled();
      }
    });

    it('should call callback with trimmed message in manual mode', async () => {
      const mockCallback = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await promptForCommitMessage('/test/repo', 'manual', mockCallback);

      if (result.type === 'input' && result.onSubmit) {
        await result.onSubmit('  feat: test  ');
        expect(mockCallback).toHaveBeenCalledWith('feat: test');
      }
    });

    it('should commit immediately in ai_automatic mode', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: auto commit');

      const mockCallback = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await promptForCommitMessage('/test/repo', 'ai_automatic', mockCallback);

      // In automatic mode, it should directly call the callback with generated message
      expect(mockCallback).toHaveBeenCalledWith('feat: auto commit');
    });

    it('should show editable prompt in ai_editable mode', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: generated message');

      const mockCallback = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await promptForCommitMessage('/test/repo', 'ai_editable', mockCallback);

      expect(result.type).toBe('input');
      expect(result.title).toBe('Review & Edit Commit Message');
      if (result.type === 'input') {
        expect(result.defaultValue).toBe('feat: generated message');
      }
    });

    it('should fall back to manual input when AI fails', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      vi.mocked(generateCommitMessage).mockResolvedValue(null);

      const mockCallback = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await promptForCommitMessage('/test/repo', 'ai_automatic', mockCallback);

      expect(result.type).toBe('input');
      expect(result.message).toContain('Auto-generation failed');
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should return error when staging fails', async () => {
      const { stageAllChanges } = await import('../../../src/utils/mergeValidation.js');
      vi.mocked(stageAllChanges).mockReturnValue({ success: false, error: 'Staging failed' });

      const mockCallback = vi.fn();

      const result = await promptForCommitMessage('/test/repo', 'manual', mockCallback);

      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to stage changes');
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('handleCommitWithOptions', () => {
    it('should handle commit_automatic option', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      const { stageAllChanges, commitChanges } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(stageAllChanges).mockReturnValue({ success: true });
      vi.mocked(commitChanges).mockReturnValue({ success: true });
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: automatic');

      const mockOnSuccess = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      await handleCommitWithOptions('/test/repo', 'commit_automatic', mockOnSuccess);

      expect(mockOnSuccess).toHaveBeenCalled();
    });

    it('should handle commit_ai_editable option', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      const { stageAllChanges } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(stageAllChanges).mockReturnValue({ success: true });
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: editable');

      const mockOnSuccess = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await handleCommitWithOptions('/test/repo', 'commit_ai_editable', mockOnSuccess);

      expect(result.type).toBe('input');
      expect(result.title).toBe('Review & Edit Commit Message');
    });

    it('should handle commit_manual option', async () => {
      const { stageAllChanges } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(stageAllChanges).mockReturnValue({ success: true });

      const mockOnSuccess = vi.fn().mockResolvedValue({ type: 'success', message: 'Done', dismissable: true });

      const result = await handleCommitWithOptions('/test/repo', 'commit_manual', mockOnSuccess);

      expect(result.type).toBe('input');
      expect(result.title).toBe('Enter Commit Message');
    });

    it('should return error when commit fails', async () => {
      const { generateCommitMessage } = await import('../../../src/utils/aiMerge.js');
      const { stageAllChanges, commitChanges } = await import('../../../src/utils/mergeValidation.js');

      vi.mocked(stageAllChanges).mockReturnValue({ success: true });
      vi.mocked(generateCommitMessage).mockResolvedValue('feat: will fail');
      vi.mocked(commitChanges).mockReturnValue({ success: false, error: 'Commit failed' });

      const mockOnSuccess = vi.fn();

      const result = await handleCommitWithOptions('/test/repo', 'commit_automatic', mockOnSuccess);

      expect(result.type).toBe('error');
      expect(result.message).toContain('Commit failed');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });
});
