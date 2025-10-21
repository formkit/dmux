/**
 * Tests for conflict resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConflictResolutionPaneForMerge } from '../../../src/actions/merge/conflictResolution.js';
import type { DmuxPane } from '../../../src/types.js';
import type { ActionContext } from '../../../src/actions/types.js';

// Mock agent detection
vi.mock('../../../src/utils/agentDetection.js', () => ({
  findClaudeCommand: vi.fn(() => Promise.resolve(true)),
  findOpencodeCommand: vi.fn(() => Promise.resolve(true)),
}));

// Mock conflict resolution pane creation
vi.mock('../../../src/utils/conflictResolutionPane.js', () => ({
  createConflictResolutionPane: vi.fn(() =>
    Promise.resolve({
      id: 'conflict-pane-1',
      slug: 'resolve-conflicts',
      prompt: 'Resolve merge conflicts',
      paneId: '%99',
      // Note: No worktreePath - conflict pane operates in targetRepoPath
    })
  ),
}));

// Mock conflict monitor
vi.mock('../../../src/utils/conflictMonitor.js', () => ({
  startConflictMonitoring: vi.fn(() => vi.fn()), // Returns cleanup function
}));

// Mock merge execution
vi.mock('../../../src/actions/merge/mergeExecution.js', () => ({
  executeMerge: vi.fn(() =>
    Promise.resolve({
      type: 'confirm',
      title: 'Merge Complete',
      message: 'Successfully merged',
    })
  ),
  executeMergeWithConflictHandling: vi.fn(() =>
    Promise.resolve({
      type: 'navigation',
      message: 'Manual resolution',
    })
  ),
}));

// Mock child_process for tmux commands
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('Conflict Resolution', () => {
  const mockPane: DmuxPane = {
    id: 'test-1',
    slug: 'test-branch',
    prompt: 'test prompt',
    paneId: '%1',
    worktreePath: '/test/worktree',
  };

  const mockContext: ActionContext = {
    projectName: 'test-project',
    panes: [mockPane],
    savePanes: vi.fn(),
    onPaneUpdate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConflictResolutionPaneForMerge', () => {
    it('should return error when no agents available', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      vi.mocked(findClaudeCommand).mockResolvedValue(false);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('error');
      expect(result.message).toContain('No AI agents available');
    });

    it('should prompt for agent choice when multiple agents available', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(true);

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('choice');
      expect(result.title).toBe('Choose AI Agent for Conflict Resolution');
      expect(result.options).toHaveLength(2);
      expect(result.options?.map(o => o.id)).toEqual(['claude', 'opencode']);
    });

    it('should use only available agent directly', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { createConflictResolutionPane } = await import('../../../src/utils/conflictResolutionPane.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('navigation');
      expect(result.title).toBe('Conflict Resolution Pane Created');
      expect(createConflictResolutionPane).toHaveBeenCalledWith({
        sourceBranch: 'test-branch',
        targetBranch: 'main',
        targetRepoPath: '/test/worktree', // Bug #10 fix: use worktree, not main repo
        agent: 'claude',
        projectName: 'test-project',
        existingPanes: [mockPane],
      });
    });

    it('should create conflict pane and update state', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { createConflictResolutionPane } = await import('../../../src/utils/conflictResolutionPane.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('navigation');
      expect(result.targetPaneId).toBe('conflict-pane-1');
      expect(mockContext.savePanes).toHaveBeenCalledWith([
        mockPane,
        {
          id: 'conflict-pane-1',
          slug: 'resolve-conflicts',
          prompt: 'Resolve merge conflicts',
          paneId: '%99',
          // No worktreePath - conflict pane operates in targetRepoPath
        },
      ]);
      expect(mockContext.onPaneUpdate).toHaveBeenCalledWith({
        id: 'conflict-pane-1',
        slug: 'resolve-conflicts',
        prompt: 'Resolve merge conflicts',
        paneId: '%99',
        // No worktreePath - operates in targetRepoPath
      });
    });

    it('should start conflict monitoring with correct worktree path', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { startConflictMonitoring } = await import('../../../src/utils/conflictMonitor.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);

      await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(startConflictMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({
          conflictPaneId: '%99',
          repoPath: '/test/worktree', // Should monitor the WORKTREE, not main repo
          onResolved: expect.any(Function),
        })
      );
    });

    it('should pass targetRepoPath (worktree) to createConflictResolutionPane', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { createConflictResolutionPane } = await import('../../../src/utils/conflictResolutionPane.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);

      await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(createConflictResolutionPane).toHaveBeenCalledWith({
        sourceBranch: 'test-branch',
        targetBranch: 'main',
        targetRepoPath: '/test/worktree', // Bug #10 fix: pass worktree path, not main repo
        agent: 'claude',
        projectName: 'test-project',
        existingPanes: [mockPane],
      });
    });

    it('should handle agent selection for multiple agents', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { createConflictResolutionPane } = await import('../../../src/utils/conflictResolutionPane.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(true);

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      if (result.type === 'choice' && result.onSelect) {
        const selectedResult = await result.onSelect('opencode');

        expect(selectedResult.type).toBe('navigation');
        expect(createConflictResolutionPane).toHaveBeenCalledWith({
          sourceBranch: 'test-branch',
          targetBranch: 'main',
          targetRepoPath: '/test/worktree', // Bug #10 fix: pass worktree path
          agent: 'opencode',
          projectName: 'test-project',
          existingPanes: [mockPane],
        });
      }
    });

    it('should handle errors during pane creation', async () => {
      const { findClaudeCommand, findOpencodeCommand } = await import('../../../src/utils/agentDetection.js');
      const { createConflictResolutionPane } = await import('../../../src/utils/conflictResolutionPane.js');

      vi.mocked(findClaudeCommand).mockResolvedValue(true);
      vi.mocked(findOpencodeCommand).mockResolvedValue(false);
      vi.mocked(createConflictResolutionPane).mockRejectedValue(new Error('Pane creation failed'));

      const result = await createConflictResolutionPaneForMerge(mockPane, mockContext, 'main', '/test/main');

      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to create conflict resolution pane');
      expect(result.message).toContain('Pane creation failed');
    });

    // NOTE: Full integration tests for onActionResult and monitoring callbacks
    // are better suited for E2E tests. The unit behavior is covered by:
    // - conflictMonitor.test.ts (monitoring logic)
    // - mergeExecution.test.ts (runtime conflict handling)
    // - Above tests (conflict pane creation flow)

    // NOTE: The onResolved callback behavior tests are integration-level tests
    // that are complex to test with mocks due to dynamic imports. The critical
    // behavior is tested at the conflictMonitor.test.ts level. The integration
    // of monitoring → pane kill → cleanup dialog is best tested manually or
    // with E2E tests.
  });
});
