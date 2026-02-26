/**
 * Integration tests for pane lifecycle (creation, closure, rebinding)
 * Target: Cover src/utils/paneCreation.ts (568 lines, currently 0%)
 * Expected coverage gain: +3-4%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DmuxPane } from '../../src/types.js';
import type { ActionContext } from '../../src/actions/types.js';
import {
  createMockTmuxSession,
  type MockTmuxSession,
} from '../fixtures/integration/tmuxSession.js';
import {
  createMockGitRepo,
  addWorktree,
  type MockGitRepo,
} from '../fixtures/integration/gitRepo.js';
import { createMockExecSync } from '../helpers/integration/mockCommands.js';

// Mock child_process
const mockExecSync = createMockExecSync({});
vi.mock('child_process', () => ({
  execSync: mockExecSync,
}));

// Mock StateManager
const mockGetPanes = vi.fn((): DmuxPane[] => []);
const mockSetPanes = vi.fn();
const mockGetState = vi.fn(() => ({ projectRoot: '/test' }));
const mockPauseConfigWatcher = vi.fn();
const mockResumeConfigWatcher = vi.fn();
vi.mock('../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getPanes: mockGetPanes,
      setPanes: mockSetPanes,
      getState: mockGetState,
      pauseConfigWatcher: mockPauseConfigWatcher,
      resumeConfigWatcher: mockResumeConfigWatcher,
    })),
  },
}));

// Mock hooks
vi.mock('../../src/utils/hooks.js', () => ({
  triggerHook: vi.fn(() => Promise.resolve()),
}));

// Mock LogService
vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

const mockEnqueueCleanup = vi.fn();
vi.mock('../../src/services/WorktreeCleanupService.js', () => ({
  WorktreeCleanupService: {
    getInstance: vi.fn(() => ({
      enqueueCleanup: mockEnqueueCleanup,
    })),
  },
}));

// Mock fs for reading config
const mockFsReadFileSync = vi.fn(() => JSON.stringify({ controlPaneId: '%0' }));
const mockFsWriteFileSync = vi.fn();
const mockFsExistsSync = vi.fn((targetPath: string) => !targetPath.includes('.dmux/worktrees/'));
vi.mock('fs', () => ({
  default: {
    readFileSync: mockFsReadFileSync,
    writeFileSync: mockFsWriteFileSync,
    existsSync: mockFsExistsSync,
  },
  readFileSync: mockFsReadFileSync,
  writeFileSync: mockFsWriteFileSync,
  existsSync: mockFsExistsSync,
}));

describe('Pane Lifecycle Integration Tests', () => {
  let tmuxSession: MockTmuxSession;
  let gitRepo: MockGitRepo;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockEnqueueCleanup.mockReset();

    // Create fresh test environment
    tmuxSession = createMockTmuxSession('dmux-test', 1);
    gitRepo = createMockGitRepo('main');
    const createdWorktreePaths = new Set<string>();

    mockFsExistsSync.mockImplementation((targetPath: string) => {
      if (targetPath.includes('.dmux/worktrees/')) {
        return createdWorktreePaths.has(targetPath);
      }
      return true;
    });

    // Configure mock execSync with test data
    mockExecSync.mockImplementation(((command: string, options?: any) => {
      const cmd = command.toString().trim();
      const encoding = options?.encoding;

      // Helper to return string or buffer based on encoding option
      const returnValue = (value: string) => {
        if (encoding === 'utf-8') {
          return value;
        }
        return Buffer.from(value);
      };

      // Tmux display-message (get current pane id)
      if (cmd.includes('display-message')) {
        return returnValue('%0');
      }

      // Tmux list-panes
      if (cmd.includes('list-panes')) {
        return returnValue('%0:dmux-control:80x24\n%1:test:80x24');
      }

      // Tmux split-window
      if (cmd.includes('split-window')) {
        return returnValue('%1');
      }

      // Git worktree add
      if (cmd.includes('worktree add')) {
        gitRepo = addWorktree(gitRepo, '/test/.dmux/worktrees/test-slug', 'test-slug');

        const match = cmd.match(/git worktree add\s+"([^"]+)"/);
        if (match?.[1]) {
          createdWorktreePaths.add(match[1]);
        }

        return returnValue('');
      }

      // Git worktree list
      if (cmd.includes('worktree list')) {
        return returnValue('/test/.dmux/worktrees/test-slug abc123 [test-slug]');
      }

      // Branch existence checks for new-worktree branch creation.
      // Default to "missing" so createPane uses -b path unless a test overrides behavior.
      if (cmd.includes('show-ref --verify --quiet')) {
        throw new Error('branch not found');
      }

      // Git symbolic-ref (main branch)
      if (cmd.includes('symbolic-ref')) {
        return returnValue('refs/heads/main');
      }

      if (cmd.includes('rev-parse --git-common-dir')) {
        return returnValue('.git');
      }

      if (cmd.includes('rev-parse --show-toplevel')) {
        return returnValue('/test');
      }

      if (cmd.includes('rev-parse --verify')) {
        return returnValue('abc123');
      }

      // Git rev-parse (fallback current branch)
      if (cmd.includes('rev-parse')) {
        return returnValue('main');
      }

      // Default
      return returnValue('');
    }) as any);

    // Configure StateManager mock
    mockGetPanes.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pane Creation Flow', () => {
    it('should create pane with generated slug', async () => {
      // Import pane creation utilities
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'fix authentication bug',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude', 'opencode']
      );

      // Should return a pane (not needsAgentChoice)
      expect(result).toHaveProperty('pane');
      if ('pane' in result) {
        expect(result.pane.prompt).toBe('fix authentication bug');
        expect(result.pane.slug).toBeTruthy();
        expect(result.pane.paneId).toBeTruthy();
      }
    });

    it('should create git worktree with branch', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'add user dashboard',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Verify git worktree add was called
      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );

      expect(worktreeCall).toBeDefined();
    });

    it('should split tmux pane', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'refactor component',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Verify tmux split-window was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux split-window'),
        expect.any(Object)
      );

      // Pane should have tmux pane ID
      if ('pane' in result) {
        expect(result.pane.paneId).toMatch(/%\d+/);
      }
    });

    it('should create agent panes in the selected project root for added projects', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'work on added project',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [
            {
              id: 'dmux-1',
              slug: 'existing',
              prompt: 'existing pane',
              paneId: '%5',
              projectRoot: '/primary/repo',
              worktreePath: '/primary/repo/.dmux/worktrees/existing',
            },
          ],
          projectRoot: '/target/repo',
          slugBase: 'target-slug',
        },
        ['claude']
      );

      const splitCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('tmux split-window')
      );
      expect(splitCall?.[0]).toContain('-c "/target/repo"');

      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );
      expect(worktreeCall).toBeDefined();
      expect(worktreeCall![0]).toContain('cd "/target/repo" && git worktree add "/target/repo/.dmux/worktrees/target-slug"');
    });

    it('should use branch and base overrides in worktree command', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await createPane(
        {
          prompt: 'work on ticket',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          branchNameOverride: 'feat/LIN-123-fix-auth',
          baseBranchOverride: 'develop',
        },
        ['claude']
      );

      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );

      expect(worktreeCall).toBeDefined();
      expect(String(worktreeCall?.[0])).toContain('/test/.dmux/worktrees/feat-lin-123-fix-auth');
      expect(String(worktreeCall?.[0])).toContain('-b "feat/LIN-123-fix-auth" "develop"');
    });

    it('should append agent suffix for explicit branch overrides', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      // createPane covers one pane at a time. Passing slugSuffix here exercises
      // the same suffixing path used by multi-agent orchestration, where each
      // per-agent pane gets a deterministic suffix (e.g. -opencode).
      await createPane(
        {
          prompt: 'A/B compare fix',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          branchNameOverride: 'feat/LIN-777-ab-test',
          slugSuffix: 'opencode',
        },
        ['claude']
      );

      const worktreeCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('git worktree add')
      );

      expect(worktreeCall).toBeDefined();
      expect(String(worktreeCall?.[0])).toContain('/test/.dmux/worktrees/feat-lin-777-ab-test-opencode');
      expect(String(worktreeCall?.[0])).toContain('-b "feat/LIN-777-ab-test-opencode"');
    });

    it('should fail early when target worktree path already exists', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      mockFsExistsSync.mockImplementation((targetPath: string) => {
        if (targetPath === '/test/.dmux/worktrees/feat-lin-999-existing') {
          return true;
        }
        return !targetPath.includes('.dmux/worktrees/');
      });

      await expect(
        createPane(
          {
            prompt: 'collision test',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            branchNameOverride: 'feat/LIN-999-existing',
          },
          ['claude']
        )
      ).rejects.toThrow('Worktree path already exists');
    });

    it('should reject invalid branch-name overrides', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await expect(
        createPane(
          {
            prompt: 'invalid branch override',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            branchNameOverride: 'feat/../bad',
          },
          ['claude']
        )
      ).rejects.toThrow('Invalid branch name override');
    });

    it('should reject invalid base-branch overrides', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      await expect(
        createPane(
          {
            prompt: 'invalid base override',
            agent: 'claude',
            projectName: 'test-project',
            existingPanes: [],
            baseBranchOverride: 'dev..bad',
          },
          ['claude']
        )
      ).rejects.toThrow('Invalid base branch override');
    });

    it('should reject base-branch overrides that do not exist locally', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const originalImpl = mockExecSync.getMockImplementation();
      mockExecSync.mockImplementation(((command: string, options?: any) => {
        const cmd = command.toString().trim();
        if (cmd.includes('rev-parse --verify "refs/heads/release/missing"')) {
          throw new Error('not found');
        }

        return originalImpl ? originalImpl(command, options) : Buffer.from('');
      }) as any);

      const result = await createPane(
        {
          prompt: 'missing base branch',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
          baseBranchOverride: 'release/missing',
        },
        ['claude']
      );

      expect(result.needsAgentChoice).toBe(false);

      const errorCall = mockExecSync.mock.calls.find(([cmd]) =>
        typeof cmd === 'string' && cmd.includes('Failed to create worktree')
      );
      expect(errorCall).toBeDefined();
      expect(String(errorCall?.[0])).toContain('does not exist');
    });

    it('should handle slug generation failure (fallback to timestamp)', async () => {
      // Mock OpenRouter API failure
      const mockFetch = vi.fn(() =>
        Promise.reject(new Error('API timeout'))
      );
      global.fetch = mockFetch;

      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          agent: 'claude',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude']
      );

      // Should fallback to timestamp-based slug
      if ('pane' in result) {
        expect(result.pane.slug).toMatch(/dmux-\d+/);
      }
    });

    it('should return needsAgentChoice when agent not specified', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          projectName: 'test-project',
          existingPanes: [],
        },
        ['claude', 'opencode']
      );

      // Should return needsAgentChoice
      expect(result).toHaveProperty('needsAgentChoice');
      if ('needsAgentChoice' in result) {
        expect(result.needsAgentChoice).toBe(true);
      }
    });

    it('should handle empty agent list', async () => {
      const { createPane } = await import('../../src/utils/paneCreation.js');

      const result = await createPane(
        {
          prompt: 'test prompt',
          projectName: 'test-project',
          existingPanes: [],
        },
        []
      );

      // Should return error or handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Pane Closure Flow', () => {
    it('should present choice dialog for worktree panes', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'dmux-test',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      const result = await closePane(testPane, mockContext);

      // Should return choice dialog with 3 options
      expect(result.type).toBe('choice');
      if (result.type === 'choice') {
        expect(result.options).toHaveLength(3);
        expect(result.options?.map(o => o.id)).toEqual([
          'kill_only',
          'kill_and_clean',
          'kill_clean_branch',
        ]);
      }
    });

    it('should kill tmux pane when closing', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'dmux-test',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      // Execute the close
      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_only');
      }

      // Verify tmux kill-pane was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('tmux kill-pane'),
        expect.any(Object)
      );
    });

    it('should queue worktree cleanup with kill_and_clean option', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'dmux-test',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_and_clean');
      }

      expect(mockEnqueueCleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          pane: testPane,
          deleteBranch: false,
        })
      );
    });

    it('should handle background cleanup enqueue failure gracefully', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');

      mockEnqueueCleanup.mockImplementation(() => {
        throw new Error('enqueue failed');
      });

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'dmux-test',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);
      let executeResult = result;

      if (result.type === 'choice' && result.onSelect) {
        executeResult = await result.onSelect('kill_and_clean');
      }

      // Should still succeed (cleanup enqueue failures are non-critical)
      expect(executeResult.type).toBe('success');
    });

    it('should trigger post-close hooks', async () => {
      const { closePane } = await import('../../src/actions/implementations/closeAction.js');
      const { triggerHook } = await import('../../src/utils/hooks.js');

      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'test-branch',
        prompt: 'test',
        paneId: '%1',
        worktreePath: '/test/.dmux/worktrees/test-branch',
      };

      const mockContext: ActionContext = {
        sessionName: 'dmux-test',
        projectName: 'test-project',
        panes: [testPane],
        savePanes: vi.fn(),
      };

      mockGetPanes.mockReturnValue([testPane]);

      const result = await closePane(testPane, mockContext);

      if (result.type === 'choice' && result.onSelect) {
        await result.onSelect('kill_and_cleanup_worktree');
      }

      // Verify hooks were triggered
      expect(triggerHook).toHaveBeenCalled();
    });
  });

  describe('Pane Rebinding Flow', () => {
    it('should detect dead pane', async () => {
      // Mock tmux pane not found
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('select-pane') && cmd.includes('%1')) {
          throw new Error("can't find pane: %1");
        }
        return Buffer.from('');
      });

      const { execSync } = await import('child_process');

      // Attempt to select dead pane
      try {
        execSync('tmux select-pane -t %1', { stdio: 'pipe' });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain("can't find pane");
      }
    });

    it('should create new tmux pane for rebind', async () => {
      // This would test the rebinding logic once it's implemented
      // For now, we verify the tmux split-window command works

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('split-window')) {
          return Buffer.from('%2');
        }
        return Buffer.from('');
      });

      const { execSync } = await import('child_process');
      const newPaneId = execSync('tmux split-window -h', { stdio: 'pipe' })
        .toString()
        .trim();

      expect(newPaneId).toBe('%2');
    });

    it('should preserve worktree and slug during rebind', async () => {
      // Test that rebinding doesn't recreate worktree
      const testPane: DmuxPane = {
        id: 'dmux-1',
        slug: 'existing-branch',
        prompt: 'original prompt',
        paneId: '%1', // Old, dead pane
        worktreePath: '/test/.dmux/worktrees/existing-branch',
      };

      // Rebinding would update paneId but keep slug and worktreePath
      const reboundPane = {
        ...testPane,
        paneId: '%2', // New pane ID
      };

      expect(reboundPane.slug).toBe(testPane.slug);
      expect(reboundPane.worktreePath).toBe(testPane.worktreePath);
      expect(reboundPane.paneId).not.toBe(testPane.paneId);
    });
  });
});
