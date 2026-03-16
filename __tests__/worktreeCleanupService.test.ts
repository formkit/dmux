import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmuxPane } from '../src/types.js';

const spawnMock = vi.hoisted(() => vi.fn());
const triggerHookMock = vi.hoisted(() => vi.fn(async () => {}));
const detectAllWorktreesMock = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../src/utils/hooks.js', () => ({
  triggerHook: triggerHookMock,
}));

vi.mock('../src/utils/worktreeDiscovery.js', () => ({
  detectAllWorktrees: detectAllWorktreesMock,
}));

vi.mock('../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => logger),
  },
}));

type MockChildProcess = EventEmitter & { stderr: EventEmitter | null };

function createSuccessfulChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stderr = new EventEmitter();

  process.nextTick(() => {
    child.emit('close', 0);
  });

  return child;
}

describe('WorktreeCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockImplementation(() => createSuccessfulChildProcess());
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('removes nested worktrees and deletes the pane branch from every repo in a multi-repo workspace cleanup', async () => {
    detectAllWorktreesMock.mockReturnValue([
      {
        worktreePath: '/test/project/.dmux/worktrees/react',
        parentRepoPath: '/test/project',
        repoName: 'project',
        branch: 'react',
        mainBranch: 'main',
        isRoot: true,
        relativePath: '.',
        depth: 0,
      },
      {
        worktreePath: '/test/project/.dmux/worktrees/react/docs-ui',
        parentRepoPath: '/test/project/docs-ui',
        repoName: 'docs-ui',
        branch: 'react',
        mainBranch: 'main',
        isRoot: false,
        relativePath: 'docs-ui',
        depth: 1,
      },
      {
        worktreePath: '/test/project/.dmux/worktrees/react/theme-schemas',
        parentRepoPath: '/test/project/theme-schemas',
        repoName: 'theme-schemas',
        branch: 'react',
        mainBranch: 'main',
        isRoot: false,
        relativePath: 'theme-schemas',
        depth: 1,
      },
    ]);

    const { WorktreeCleanupService } = await import('../src/services/WorktreeCleanupService.js');
    (WorktreeCleanupService as any).instance = undefined;

    const pane: DmuxPane = {
      id: 'dmux-1',
      slug: 'react',
      branchName: 'react',
      prompt: '',
      paneId: '%1',
      worktreePath: '/test/project/.dmux/worktrees/react',
    };

    const service = WorktreeCleanupService.getInstance() as any;
    await service.runCleanup({
      pane,
      paneProjectRoot: '/test/project',
      mainRepoPath: '/test/project',
      deleteBranch: true,
    });

    const gitCalls = spawnMock.mock.calls.map((call) => ({
      args: call[1],
      cwd: call[2]?.cwd,
    }));

    const worktreeRemovalCalls = gitCalls.filter((call) => call.args[0] === 'worktree');
    expect(worktreeRemovalCalls).toEqual(expect.arrayContaining([
      {
        args: ['worktree', 'remove', '/test/project/.dmux/worktrees/react/docs-ui', '--force'],
        cwd: '/test/project/docs-ui',
      },
      {
        args: ['worktree', 'remove', '/test/project/.dmux/worktrees/react/theme-schemas', '--force'],
        cwd: '/test/project/theme-schemas',
      },
      {
        args: ['worktree', 'remove', '/test/project/.dmux/worktrees/react', '--force'],
        cwd: '/test/project',
      },
    ]));
    expect(worktreeRemovalCalls.at(-1)).toEqual({
      args: ['worktree', 'remove', '/test/project/.dmux/worktrees/react', '--force'],
      cwd: '/test/project',
    });

    expect(gitCalls).toEqual(expect.arrayContaining([
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/react'],
        cwd: '/test/project',
      },
      {
        args: ['branch', '-D', 'react'],
        cwd: '/test/project',
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/react'],
        cwd: '/test/project/docs-ui',
      },
      {
        args: ['branch', '-D', 'react'],
        cwd: '/test/project/docs-ui',
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/react'],
        cwd: '/test/project/theme-schemas',
      },
      {
        args: ['branch', '-D', 'react'],
        cwd: '/test/project/theme-schemas',
      },
    ]));

    expect(triggerHookMock).toHaveBeenCalledWith('worktree_removed', '/test/project', pane);
  });
});
