import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmuxPane } from '../src/types.js';

const mocked = vi.hoisted(() => ({
  existsSync: vi.fn(),
  getCurrentBranch: vi.fn(),
  branchExists: vi.fn(),
  hasCommitsToMerge: vi.fn(),
}));

vi.mock('fs', () => ({
  default: { existsSync: mocked.existsSync },
  existsSync: mocked.existsSync,
}));

vi.mock('../src/utils/git.js', () => ({
  getCurrentBranch: mocked.getCurrentBranch,
  branchExists: mocked.branchExists,
  getPaneBranchName: (pane: DmuxPane) => pane.branchName || pane.slug,
}));

vi.mock('../src/utils/mergeValidation.js', () => ({
  hasCommitsToMerge: mocked.hasCommitsToMerge,
}));

import {
  buildFallbackMergeMessage,
  createMergeTargetChain,
  resolveMergeTarget,
} from '../src/utils/mergeTargets.js';

describe('merge target resolution', () => {
  beforeEach(() => {
    mocked.existsSync.mockReset();
    mocked.getCurrentBranch.mockReset();
    mocked.branchExists.mockReset();
    mocked.hasCommitsToMerge.mockReset();
  });

  it('builds a merge target chain from the parent worktree and its base branch', () => {
    mocked.getCurrentBranch.mockReturnValue('main');

    const chain = createMergeTargetChain(
      {
        id: '1',
        slug: 'feature-parent',
        prompt: 'parent',
        paneId: '%1',
        worktreePath: '/repo/.dmux/worktrees/feature-parent',
      },
      '/repo'
    );

    expect(chain).toEqual([
      {
        slug: 'feature-parent',
        branchName: 'feature-parent',
        worktreePath: '/repo/.dmux/worktrees/feature-parent',
      },
      {
        slug: 'main',
        branchName: 'main',
        worktreePath: '/repo',
      },
    ]);
  });

  it('merges top-level worktrees back into the project root checkout', () => {
    mocked.getCurrentBranch.mockReturnValue('main');

    const resolution = resolveMergeTarget({
      id: '1',
      slug: 'feature-a',
      prompt: 'test',
      paneId: '%1',
      worktreePath: '/repo/.dmux/worktrees/feature-a',
    });

    expect(resolution).toMatchObject({
      targetRepoPath: '/repo',
      targetBranch: 'main',
      requiresConfirmation: false,
    });
  });

  it('uses the parent worktree when it still exists and has not been merged upstream', () => {
    mocked.existsSync.mockImplementation((value: string) => (
      value === '/repo/.dmux/worktrees/feature-parent'
      || value === '/repo'
    ));
    mocked.getCurrentBranch.mockImplementation((value: string) => (
      value === '/repo/.dmux/worktrees/feature-parent' ? 'feature-parent' : 'main'
    ));
    mocked.branchExists.mockReturnValue(true);
    mocked.hasCommitsToMerge.mockReturnValue(true);

    const resolution = resolveMergeTarget({
      id: '2',
      slug: 'feature-child',
      prompt: 'test',
      paneId: '%2',
      worktreePath: '/repo/.dmux/worktrees/feature-child',
      mergeTargetChain: [
        {
          slug: 'feature-parent',
          branchName: 'feature-parent',
          worktreePath: '/repo/.dmux/worktrees/feature-parent',
        },
        {
          slug: 'main',
          branchName: 'main',
          worktreePath: '/repo',
        },
      ],
    });

    expect(resolution).toMatchObject({
      targetRepoPath: '/repo/.dmux/worktrees/feature-parent',
      targetBranch: 'feature-parent',
      requiresConfirmation: false,
    });
  });

  it('falls back to the next ancestor when the parent worktree is gone', () => {
    mocked.existsSync.mockImplementation((value: string) => value === '/repo');
    mocked.getCurrentBranch.mockReturnValue('main');

    const resolution = resolveMergeTarget({
      id: '3',
      slug: 'feature-child',
      prompt: 'test',
      paneId: '%3',
      worktreePath: '/repo/.dmux/worktrees/feature-child',
      mergeTargetChain: [
        {
          slug: 'feature-parent',
          branchName: 'feature-parent',
          worktreePath: '/repo/.dmux/worktrees/feature-parent',
        },
        {
          slug: 'main',
          branchName: 'main',
          worktreePath: '/repo',
        },
      ],
    });

    expect(resolution).toMatchObject({
      targetRepoPath: '/repo',
      targetBranch: 'main',
      requiresConfirmation: true,
      fallbackReason: 'missing',
    });
    expect(buildFallbackMergeMessage(
      {
        id: '3',
        slug: 'feature-child',
        prompt: 'test',
        paneId: '%3',
      },
      resolution!
    )).toContain('no longer available');
  });

  it('falls back to the next ancestor when the parent branch is already merged upstream', () => {
    mocked.existsSync.mockImplementation((value: string) => (
      value === '/repo/.dmux/worktrees/feature-parent'
      || value === '/repo'
    ));
    mocked.getCurrentBranch.mockImplementation((value: string) => (
      value === '/repo/.dmux/worktrees/feature-parent' ? 'feature-parent' : 'main'
    ));
    mocked.branchExists.mockReturnValue(true);
    mocked.hasCommitsToMerge.mockReturnValue(false);

    const resolution = resolveMergeTarget({
      id: '4',
      slug: 'feature-child',
      prompt: 'test',
      paneId: '%4',
      worktreePath: '/repo/.dmux/worktrees/feature-child',
      mergeTargetChain: [
        {
          slug: 'feature-parent',
          branchName: 'feature-parent',
          worktreePath: '/repo/.dmux/worktrees/feature-parent',
        },
        {
          slug: 'main',
          branchName: 'main',
          worktreePath: '/repo',
        },
      ],
    });

    expect(resolution).toMatchObject({
      targetRepoPath: '/repo',
      targetBranch: 'main',
      requiresConfirmation: true,
      fallbackReason: 'merged',
    });
    expect(buildFallbackMergeMessage(
      {
        id: '4',
        slug: 'feature-child',
        prompt: 'test',
        paneId: '%4',
      },
      resolution!
    )).toContain('already been merged upstream');
  });
});
