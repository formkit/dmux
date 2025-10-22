/**
 * Mock git repository fixtures for integration tests
 */

export interface MockGitRepo {
  mainBranch: string;
  currentBranch: string;
  worktrees: MockWorktree[];
  commits: MockCommit[];
}

export interface MockWorktree {
  path: string;
  branch: string;
  commit: string;
}

export interface MockCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

/**
 * Create a mock git repository
 */
export function createMockGitRepo(mainBranch: string = 'main'): MockGitRepo {
  return {
    mainBranch,
    currentBranch: mainBranch,
    worktrees: [],
    commits: [
      {
        hash: 'abc123',
        message: 'Initial commit',
        author: 'Test User',
        date: '2025-01-01',
      },
    ],
  };
}

/**
 * Add a worktree to the mock repo
 */
export function addWorktree(
  repo: MockGitRepo,
  path: string,
  branch: string
): MockGitRepo {
  return {
    ...repo,
    worktrees: [
      ...repo.worktrees,
      {
        path,
        branch,
        commit: repo.commits[repo.commits.length - 1]!.hash,
      },
    ],
  };
}

/**
 * Generate git worktree list output
 */
export function mockWorktreeListOutput(repo: MockGitRepo): string {
  return repo.worktrees
    .map((wt) => `${wt.path} ${wt.commit} [${wt.branch}]`)
    .join('\n');
}

/**
 * Generate git branch output
 */
export function mockBranchOutput(repo: MockGitRepo): string {
  const branches = [repo.mainBranch, ...repo.worktrees.map((wt) => wt.branch)];
  return branches
    .map((branch) => {
      const prefix = branch === repo.currentBranch ? '* ' : '  ';
      return `${prefix}${branch}`;
    })
    .join('\n');
}

/**
 * Generate git status output
 */
export function mockGitStatusOutput(clean: boolean = true): string {
  if (clean) {
    return 'On branch main\nnothing to commit, working tree clean';
  }
  return 'On branch main\nChanges not staged for commit:\n  modified:   test.ts';
}

/**
 * Generate git diff output
 */
export function mockGitDiffOutput(changes: string[] = []): string {
  if (changes.length === 0) {
    return '';
  }
  return changes
    .map((change, i) => `diff --git a/file${i}.ts b/file${i}.ts\n+${change}`)
    .join('\n');
}
