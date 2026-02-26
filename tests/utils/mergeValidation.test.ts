import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

import { hasCommitsToMerge, validateMerge } from '../../src/utils/mergeValidation.js';

describe('mergeValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasCommitsToMerge', () => {
    it('uses rev-list count and returns true when source is ahead', () => {
      mockExecSync.mockReturnValue('3\n');

      const result = hasCommitsToMerge('/repo', 'feature/test', 'main');

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-list --count "main..feature/test"',
        expect.objectContaining({
          cwd: '/repo',
          encoding: 'utf-8',
        })
      );
    });

    it('falls back to HEAD when branch refs are empty', () => {
      mockExecSync.mockReturnValue('1\n');

      const result = hasCommitsToMerge('/repo', '   ', '   ');

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-list --count "HEAD..HEAD"',
        expect.objectContaining({
          cwd: '/repo',
          encoding: 'utf-8',
        })
      );
    });
  });

  describe('validateMerge', () => {
    it('does not add nothing_to_merge when main repo has uncommitted changes', () => {
      mockExecSync.mockImplementation((command: string, options?: { cwd?: string }) => {
        if (command === 'git branch --show-current') {
          return 'main\n';
        }

        if (command === 'git status --porcelain') {
          if (options?.cwd === '/repo/main') {
            return ' M changed.ts\n';
          }
          return '';
        }

        if (command.startsWith('git rev-list --count')) {
          return '0\n';
        }

        if (command.startsWith('git merge-tree')) {
          return '';
        }

        return '';
      });

      const result = validateMerge('/repo/main', '/repo/worktree', 'feature/test');
      const issueTypes = result.issues.map(issue => issue.type);

      expect(issueTypes).toContain('main_dirty');
      expect(issueTypes).not.toContain('nothing_to_merge');
    });

    it('adds nothing_to_merge only when both repos are clean and no commits exist', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git branch --show-current') {
          return 'main\n';
        }

        if (command === 'git status --porcelain') {
          return '';
        }

        if (command.startsWith('git rev-list --count')) {
          return '0\n';
        }

        if (command.startsWith('git merge-tree')) {
          return '';
        }

        return '';
      });

      const result = validateMerge('/repo/main', '/repo/worktree', 'feature/test');

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.type).toBe('nothing_to_merge');
    });
  });
});
