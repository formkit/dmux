import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.hoisted(() => vi.fn());
const createPaneMock = vi.hoisted(() => vi.fn());
const triggerHookMock = vi.hoisted(() => vi.fn(async () => {}));
const writeWorktreeMetadataMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

vi.mock('../src/utils/paneCreation.js', () => ({
  createPane: createPaneMock,
}));

vi.mock('../src/utils/hooks.js', () => ({
  triggerHook: triggerHookMock,
}));

vi.mock('../src/utils/worktreeMetadata.js', () => ({
  writeWorktreeMetadata: writeWorktreeMetadataMock,
}));

vi.mock('../src/utils/settingsManager.js', () => ({
  SettingsManager: vi.fn(() => ({
    getSettings: vi.fn(() => ({
      permissionMode: 'plan',
    })),
  })),
}));

function createTempRepoDir(prefix: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
  return tempDir;
}

describe('resumeBranches', () => {
  let rootRepo: string;
  let childRepo: string;
  let orphanedRootWorktree: string;

  beforeEach(() => {
    vi.clearAllMocks();

    rootRepo = createTempRepoDir('dmux-resume-root-');
    childRepo = path.join(rootRepo, 'child-repo');
    fs.mkdirSync(path.join(childRepo, '.git'), { recursive: true });

    orphanedRootWorktree = path.join(rootRepo, '.dmux', 'worktrees', 'reopen-me');
    fs.mkdirSync(orphanedRootWorktree, { recursive: true });
    fs.writeFileSync(path.join(orphanedRootWorktree, '.git'), 'gitdir: /tmp/reopen-me\n', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(rootRepo, { recursive: true, force: true });
  });

  it('dedupes orphaned worktrees with local and remote branches across child repos', async () => {
    execSyncMock.mockImplementation((command: string, options?: { cwd?: string; encoding?: string }) => {
      const cwd = options?.cwd;
      const encoding = options?.encoding;
      const output = (value: string) => encoding ? value : Buffer.from(value);

      if (
        cwd === orphanedRootWorktree
        && (
          command.includes("'branch' '--show-current'")
          || command.includes('branch --show-current')
        )
      ) {
        return output('feature/reopen-me');
      }
      if (
        cwd === orphanedRootWorktree
        && (
          command.includes("'status' '--porcelain'")
          || command.includes('status --porcelain')
        )
      ) {
        return output('M  src/index.ts');
      }

      if (cwd === rootRepo && command.includes("'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{upstream}'")) {
        return output('origin/main');
      }
      if (cwd === childRepo && command.includes("'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{upstream}'")) {
        return output('origin/main');
      }

      if (cwd === rootRepo && command.includes("'branch' '--show-current'")) {
        return output('main');
      }
      if (cwd === childRepo && command.includes("'branch' '--show-current'")) {
        return output('main');
      }

      if (cwd === rootRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/heads'")) {
        return output('main\nfeature/local-parent');
      }
      if (cwd === childRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/heads'")) {
        return output('child/local-only');
      }

      if (cwd === rootRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/remotes/origin'")) {
        return output('origin/feature/reopen-me\norigin/feature/remote-only');
      }
      if (cwd === childRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/remotes/origin'")) {
        return output('origin/feature/remote-only\norigin/child/remote-child-only');
      }

      return output('');
    });

    const { getResumableBranches } = await import('../src/utils/resumeBranches.js');

    const candidates = getResumableBranches(rootRepo, []);

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchName: 'feature/reopen-me',
          slug: 'reopen-me',
          path: orphanedRootWorktree,
          hasUncommittedChanges: true,
          hasWorktree: true,
          hasLocalBranch: true,
          hasRemoteBranch: true,
          isRemote: false,
        }),
        expect.objectContaining({
          branchName: 'child/local-only',
          hasWorktree: false,
          hasLocalBranch: true,
          hasRemoteBranch: false,
          isRemote: false,
        }),
        expect.objectContaining({
          branchName: 'feature/remote-only',
          hasWorktree: false,
          hasLocalBranch: false,
          hasRemoteBranch: true,
          isRemote: true,
        }),
        expect.objectContaining({
          branchName: 'child/remote-child-only',
          hasWorktree: false,
          hasLocalBranch: false,
          hasRemoteBranch: true,
          isRemote: true,
        }),
      ])
    );
  });

  it('skips remote branch scans until remote sources are requested', async () => {
    execSyncMock.mockImplementation((command: string, options?: { cwd?: string; encoding?: string }) => {
      const cwd = options?.cwd;
      const encoding = options?.encoding;
      const output = (value: string) => encoding ? value : Buffer.from(value);

      if (
        cwd === orphanedRootWorktree
        && (
          command.includes("'branch' '--show-current'")
          || command.includes('branch --show-current')
        )
      ) {
        return output('feature/reopen-me');
      }
      if (
        cwd === orphanedRootWorktree
        && (
          command.includes("'status' '--porcelain'")
          || command.includes('status --porcelain')
        )
      ) {
        return output('');
      }

      if (cwd === rootRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/heads'")) {
        return output('main\nfeature/local-parent');
      }
      if (cwd === childRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/heads'")) {
        return output('child/local-only');
      }

      if (command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/remotes/origin'")) {
        throw new Error('remote branches should not be queried');
      }

      return output('');
    });

    const { getResumableBranches } = await import('../src/utils/resumeBranches.js');

    const candidates = getResumableBranches(rootRepo, [], {
      includeRemoteBranches: false,
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchName: 'feature/reopen-me',
          hasRemoteBranch: false,
        }),
        expect.objectContaining({
          branchName: 'feature/local-parent',
          hasLocalBranch: true,
          hasRemoteBranch: false,
        }),
        expect.objectContaining({
          branchName: 'child/local-only',
          hasLocalBranch: true,
          hasRemoteBranch: false,
        }),
      ])
    );
  });

  it('creates root and child worktrees for a remote branch and runs hooks', async () => {
    const createdPaths: string[] = [];

    createPaneMock.mockResolvedValue({
      pane: {
        id: 'dmux-1',
        slug: 'remote-shared',
        branchName: 'feature/remote-shared',
        prompt: 'No initial prompt',
        paneId: '%1',
        projectRoot: rootRepo,
        projectName: path.basename(rootRepo),
        worktreePath: path.join(rootRepo, '.dmux', 'worktrees', 'remote-shared'),
      },
      needsAgentChoice: false,
    });

    execSyncMock.mockImplementation((command: string, options?: { cwd?: string; encoding?: string }) => {
      const cwd = options?.cwd;
      const encoding = options?.encoding;
      const output = (value: string) => encoding ? value : Buffer.from(value);

      if (command.includes("'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{upstream}'")) {
        return output('origin/main');
      }
      if (command.includes("'branch' '--show-current'")) {
        return output('main');
      }
      if (command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/heads'")) {
        return output('main');
      }
      if (cwd === rootRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/remotes/origin'")) {
        return output('origin/feature/remote-shared');
      }
      if (cwd === childRepo && command.includes("'for-each-ref' '--format=%(refname:short)' 'refs/remotes/origin'")) {
        return output('');
      }
      if (command.includes("'symbolic-ref' 'refs/remotes/origin/HEAD'")) {
        return output('refs/remotes/origin/main');
      }
      if (command.includes("'show-ref' '--verify' '--quiet' 'refs/heads/main'")) {
        return output('');
      }
      if (command.includes("'branch' '--track' 'feature/remote-shared' 'origin/feature/remote-shared'")) {
        return output('');
      }
      if (command.includes("'branch' 'feature/remote-shared' 'main'")) {
        return output('');
      }
      if (command.includes("'worktree' 'prune'")) {
        return output('');
      }
      if (command.includes("'worktree' 'add'")) {
        const match = command.match(/'worktree' 'add' '([^']+)' 'feature\/remote-shared'/);
        if (match) {
          const worktreePath = match[1];
          createdPaths.push(worktreePath!);
          fs.mkdirSync(worktreePath!, { recursive: true });
          fs.writeFileSync(path.join(worktreePath!, '.git'), 'gitdir: /tmp/worktree\n', 'utf-8');
        }
        return output('');
      }

      return output('');
    });

    const { resumeBranchWorkspace } = await import('../src/utils/resumeBranches.js');

    await resumeBranchWorkspace({
      agent: 'codex',
      branchName: 'feature/remote-shared',
      projectRoot: rootRepo,
      existingPanes: [],
      sessionConfigPath: path.join(rootRepo, '.dmux', 'dmux.config.json'),
      sessionProjectRoot: rootRepo,
    });

    const rootWorktreePath = path.join(rootRepo, '.dmux', 'worktrees', 'remote-shared');
    const childWorktreePath = path.join(rootWorktreePath, 'child-repo');

    expect(createdPaths).toEqual([rootWorktreePath, childWorktreePath]);
    expect(writeWorktreeMetadataMock).toHaveBeenCalledWith(
      rootWorktreePath,
      expect.objectContaining({
        agent: 'codex',
        permissionMode: 'plan',
        branchName: 'feature/remote-shared',
      })
    );
    expect(writeWorktreeMetadataMock).toHaveBeenCalledWith(
      childWorktreePath,
      expect.objectContaining({
        branchName: 'feature/remote-shared',
      })
    );
    expect(createPaneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '',
        agent: 'codex',
        projectRoot: rootRepo,
        existingWorktree: {
          slug: 'remote-shared',
          worktreePath: rootWorktreePath,
          branchName: 'feature/remote-shared',
        },
      }),
      ['codex']
    );
    expect(triggerHookMock).toHaveBeenCalledWith(
      'worktree_created',
      childRepo,
      undefined,
      expect.objectContaining({
        DMUX_AGENT: 'codex',
        DMUX_BRANCH: 'feature/remote-shared',
        DMUX_WORKTREE_PATH: childWorktreePath,
      })
    );
  });
});
