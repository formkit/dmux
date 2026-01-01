/**
 * Worktree Discovery Utilities
 *
 * Scans a directory for nested git worktrees (including the root).
 * Used for multi-merge to find sub-worktrees created by hooks.
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, basename, relative } from 'path';
import type { WorktreeInfo } from '../actions/merge/types.js';
import { getMainBranch, getCurrentBranch } from './git.js';

/**
 * Detect all git worktrees within a directory (recursively)
 *
 * @param rootWorktreePath - The root worktree path (dmux pane's worktree)
 * @returns Array of WorktreeInfo objects, ordered by depth (deepest first, root last)
 */
export function detectAllWorktrees(rootWorktreePath: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];

  // Add the root worktree first
  const rootInfo = getWorktreeInfo(rootWorktreePath, rootWorktreePath, true);
  if (rootInfo) {
    worktrees.push(rootInfo);
  }

  // Recursively scan for sub-worktrees
  scanForWorktrees(rootWorktreePath, rootWorktreePath, worktrees, 1);

  // Sort by depth descending (deepest first, root last)
  // This ensures sub-worktrees are merged before their parents
  worktrees.sort((a, b) => b.depth - a.depth);

  return worktrees;
}

/**
 * Recursively scan a directory for git worktrees
 */
function scanForWorktrees(
  dirPath: string,
  rootWorktreePath: string,
  worktrees: WorktreeInfo[],
  depth: number
): void {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden directories (except we need to check for .git)
      if (entry.name.startsWith('.') && entry.name !== '.git') {
        continue;
      }

      // Skip node_modules and other common large directories
      if (entry.name === 'node_modules' || entry.name === 'vendor' || entry.name === '.pnpm') {
        continue;
      }

      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Check if this directory is a worktree (has .git file, not directory)
        const gitPath = join(fullPath, '.git');
        if (existsSync(gitPath)) {
          const gitStat = statSync(gitPath);

          if (gitStat.isFile()) {
            // This is a worktree (has .git file pointing to parent)
            const worktreeInfo = getWorktreeInfo(fullPath, rootWorktreePath, false, depth);
            if (worktreeInfo) {
              worktrees.push(worktreeInfo);
            }
            // Continue scanning inside this worktree for nested worktrees
            scanForWorktrees(fullPath, rootWorktreePath, worktrees, depth + 1);
          } else if (gitStat.isDirectory()) {
            // This is a full git repository, not a worktree
            // It could still contain worktrees inside it, but we skip the repo itself
            // (it's not a worktree of another repo)
            scanForWorktrees(fullPath, rootWorktreePath, worktrees, depth + 1);
          }
        } else {
          // Regular directory, continue scanning
          scanForWorktrees(fullPath, rootWorktreePath, worktrees, depth);
        }
      }
    }
  } catch (error) {
    // Permission denied or other errors - skip this directory
    console.error(`[worktreeDiscovery] Error scanning ${dirPath}: ${error}`);
  }
}

/**
 * Get detailed information about a worktree
 */
function getWorktreeInfo(
  worktreePath: string,
  rootWorktreePath: string,
  isRoot: boolean,
  depth: number = 0
): WorktreeInfo | null {
  try {
    // Get the parent repo path using git rev-parse
    const parentRepoPath = getWorktreeParentPath(worktreePath);
    if (!parentRepoPath) {
      console.error(`[worktreeDiscovery] Could not determine parent for ${worktreePath}`);
      return null;
    }

    // Get repo name from parent path
    const repoName = getRepoName(parentRepoPath);

    // Get current branch in worktree
    const branch = getCurrentBranch(worktreePath);

    // Get main branch in parent repo
    const mainBranch = getMainBranchForRepo(parentRepoPath);

    // Calculate relative path from root
    const relativePath = isRoot ? '.' : relative(rootWorktreePath, worktreePath);

    return {
      worktreePath,
      parentRepoPath,
      repoName,
      branch,
      mainBranch,
      isRoot,
      relativePath,
      depth,
    };
  } catch (error) {
    console.error(`[worktreeDiscovery] Error getting info for ${worktreePath}: ${error}`);
    return null;
  }
}

/**
 * Get the parent repository path for a worktree
 *
 * Uses: git rev-parse --path-format=absolute --git-common-dir
 * Then removes ".git" suffix to get repo root
 */
export function getWorktreeParentPath(worktreePath: string): string | null {
  try {
    // Get the common git directory (the parent repo's .git or .git/worktrees/...)
    const gitCommonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // The git-common-dir returns the .git directory path
    // Remove the ".git" suffix to get the repo root
    // Handle both "/path/to/repo/.git" and "/path/to/repo/.git/worktrees/name"
    let parentPath = gitCommonDir;

    // If it ends with .git, remove it
    if (parentPath.endsWith('.git')) {
      parentPath = parentPath.slice(0, -4); // Remove ".git"
      if (parentPath.endsWith('/')) {
        parentPath = parentPath.slice(0, -1); // Remove trailing slash
      }
    } else if (parentPath.includes('/.git/')) {
      // It's a path like /repo/.git/worktrees/name, extract the repo path
      parentPath = parentPath.split('/.git/')[0];
    }

    // Verify by getting the toplevel
    const topLevel = execSync('git rev-parse --path-format=absolute --show-toplevel', {
      cwd: parentPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    return topLevel;
  } catch (error) {
    console.error(`[worktreeDiscovery] Error getting parent path for ${worktreePath}: ${error}`);
    return null;
  }
}

/**
 * Get repository name from path (directory name)
 */
export function getRepoName(repoPath: string): string {
  return basename(repoPath);
}

/**
 * Get main branch for a specific repo (running git commands in that repo's context)
 */
function getMainBranchForRepo(repoPath: string): string {
  try {
    // First try to get the default branch from origin
    const originHead = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null', {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();

    if (originHead) {
      const match = originHead.match(/refs\/remotes\/origin\/(.+)/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // Fallback if origin/HEAD is not set
  }

  try {
    // Check if 'main' branch exists
    execSync('git show-ref --verify --quiet refs/heads/main', {
      cwd: repoPath,
      stdio: 'pipe',
    });
    return 'main';
  } catch {
    // main doesn't exist
  }

  try {
    // Check if 'master' branch exists
    execSync('git show-ref --verify --quiet refs/heads/master', {
      cwd: repoPath,
      stdio: 'pipe',
    });
    return 'master';
  } catch {
    // master doesn't exist
  }

  return 'main'; // Default fallback
}

/**
 * Check if a directory is a git worktree (has .git file, not directory)
 */
export function isGitWorktree(dirPath: string): boolean {
  const gitPath = join(dirPath, '.git');
  if (!existsSync(gitPath)) {
    return false;
  }
  const stat = statSync(gitPath);
  return stat.isFile();
}

/**
 * Check if a directory is a git repository root (has .git directory)
 */
export function isGitRepository(dirPath: string): boolean {
  const gitPath = join(dirPath, '.git');
  if (!existsSync(gitPath)) {
    return false;
  }
  const stat = statSync(gitPath);
  return stat.isDirectory();
}

/**
 * Generate a display label for a worktree
 * Format: "repo-name (branch)" or "repo-name (branch) - relative/path"
 */
export function getWorktreeDisplayLabel(worktree: WorktreeInfo): string {
  const baseLabel = `${worktree.repoName} (${worktree.branch})`;
  if (worktree.isRoot || worktree.relativePath === '.') {
    return baseLabel;
  }
  return `${baseLabel} - ${worktree.relativePath}`;
}
