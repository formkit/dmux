/**
 * Merge Validation Utilities
 *
 * Provides comprehensive pre-merge validation to detect issues before attempting merge
 */

import { execSync } from 'child_process';
import { LogService } from '../services/LogService.js';
import { getCurrentBranch as getCurrentBranchUtil } from './git.js';

export interface MergeValidationResult {
  canMerge: boolean;
  issues: MergeIssue[];
  mainBranch: string;
  worktreeBranch: string;
}

export interface MergeIssue {
  type: 'main_dirty' | 'worktree_uncommitted' | 'merge_conflict' | 'nothing_to_merge';
  message: string;
  files?: string[];
  canAutoResolve: boolean;
}

export interface GitStatus {
  hasChanges: boolean;
  files: string[];
  summary: string;
}

/**
 * Get git status for a repository
 */
export function getGitStatus(repoPath: string): GitStatus {
  try {
    LogService.getInstance().info(`Getting git status for: ${repoPath}`, 'mergeValidation');
    const statusOutput = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const files = statusOutput
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Git status porcelain format can vary:
        // Standard: " M filename" (2 status chars + space + filename)
        // Sometimes: "M filename" (1 status char + space + filename)
        // Solution: trim leading spaces, find first space, take everything after it and trim again
        const trimmed = line.trimStart();
        const spaceIndex = trimmed.indexOf(' ');
        const filename = spaceIndex >= 0 ? trimmed.slice(spaceIndex + 1).trim() : trimmed;
        LogService.getInstance().info(`Git status: "${line}" → "${filename}"`, 'mergeValidation');
        return filename;
      });

    LogService.getInstance().info(`Final files for ${repoPath}: ${JSON.stringify(files)}`, 'mergeValidation');

    return {
      hasChanges: files.length > 0,
      files,
      summary: statusOutput.trim(),
    };
  } catch (error) {
    return {
      hasChanges: false,
      files: [],
      summary: '',
    };
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(repoPath: string): string {
  return getCurrentBranchUtil(repoPath);
}

/**
 * Check if there are any commits to merge
 */
export function hasCommitsToMerge(repoPath: string, fromBranch: string, toBranch: string): boolean {
  try {
    const output = execSync(`git log ${toBranch}..${fromBranch} --oneline`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect potential merge conflicts without actually merging
 */
export function detectMergeConflicts(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string
): { hasConflicts: boolean; conflictFiles: string[] } {
  try {
    // Use git merge-tree to simulate merge without touching working directory
    const output = execSync(
      `git merge-tree $(git merge-base ${targetBranch} ${sourceBranch}) ${targetBranch} ${sourceBranch}`,
      {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    // Check for conflict markers in output
    const hasConflicts = output.includes('<<<<<<<') || output.includes('>>>>>>>');

    // Extract conflicting files (lines that contain conflict markers)
    const conflictFiles: string[] = [];
    if (hasConflicts) {
      const lines = output.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('+<<<<<<<')) {
          // Try to find filename in nearby lines
          for (let j = Math.max(0, i - 10); j < i; j++) {
            if (lines[j].startsWith('diff --git')) {
              const match = lines[j].match(/b\/(.+)$/);
              if (match) {
                conflictFiles.push(match[1]);
              }
              break;
            }
          }
        }
      }
    }

    return { hasConflicts, conflictFiles };
  } catch (error) {
    // If git merge-tree fails, try a simpler approach
    try {
      // Check if branches have diverged (different commits)
      const diverged = execSync(
        `git rev-list --left-right --count ${targetBranch}...${sourceBranch}`,
        {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      const [behind, ahead] = diverged.trim().split('\t').map(Number);

      // If both branches have commits (diverged), there might be conflicts
      // If only one side has commits, it's a fast-forward merge (no conflicts)
      if (behind > 0 && ahead > 0) {
        // Get list of changed files on both sides
        const changedFiles = execSync(
          `git diff --name-only ${targetBranch}...${sourceBranch}`,
          {
            cwd: repoPath,
            encoding: 'utf-8',
            stdio: 'pipe',
          }
        ).trim().split('\n').filter(Boolean);

        return { hasConflicts: true, conflictFiles: changedFiles };
      }

      // Fast-forward merge, no conflicts
      return { hasConflicts: false, conflictFiles: [] };
    } catch {
      // If everything fails, be conservative but don't claim conflicts
      return { hasConflicts: false, conflictFiles: [] };
    }
  }
}

/**
 * Comprehensive pre-merge validation
 */
export function validateMerge(
  mainRepoPath: string,
  worktreePath: string,
  worktreeBranch: string
): MergeValidationResult {
  const issues: MergeIssue[] = [];

  // Get current main branch
  const mainBranch = getCurrentBranch(mainRepoPath);

  // Check if main branch is clean
  const mainStatus = getGitStatus(mainRepoPath);
  if (mainStatus.hasChanges) {
    issues.push({
      type: 'main_dirty',
      message: `Main branch (${mainBranch}) has uncommitted changes`,
      files: mainStatus.files,
      canAutoResolve: true, // Can offer to commit or stash
    });
  }

  // Check if worktree has uncommitted changes
  const worktreeStatus = getGitStatus(worktreePath);
  LogService.getInstance().info(
    `Worktree status: hasChanges=${worktreeStatus.hasChanges}, files=${JSON.stringify(worktreeStatus.files)}`,
    'mergeValidation'
  );
  if (worktreeStatus.hasChanges) {
    issues.push({
      type: 'worktree_uncommitted',
      message: `Worktree has uncommitted changes`,
      files: worktreeStatus.files,
      canAutoResolve: true, // Can offer to commit with AI message
    });
  }

  // Check if there's anything to merge (commits OR uncommitted changes)
  const hasCommits = hasCommitsToMerge(mainRepoPath, worktreeBranch, mainBranch);
  LogService.getInstance().info(
    `Merge check: hasCommits=${hasCommits}, worktreeHasChanges=${worktreeStatus.hasChanges}`,
    'mergeValidation'
  );
  if (!hasCommits && !worktreeStatus.hasChanges) {
    LogService.getInstance().info('Adding nothing_to_merge issue', 'mergeValidation');
    issues.push({
      type: 'nothing_to_merge',
      message: 'No new commits to merge',
      canAutoResolve: false,
    });
  }

  // Detect potential merge conflicts
  const { hasConflicts, conflictFiles } = detectMergeConflicts(
    mainRepoPath,
    worktreeBranch,
    mainBranch
  );

  if (hasConflicts) {
    issues.push({
      type: 'merge_conflict',
      message: 'Merge conflicts detected',
      files: conflictFiles.length > 0 ? conflictFiles : ['(conflict detection incomplete)'],
      canAutoResolve: true, // Can offer AI-assisted merge
    });
  }

  return {
    canMerge: issues.length === 0,
    issues,
    mainBranch,
    worktreeBranch,
  };
}

/**
 * Stage all uncommitted changes
 */
export function stageAllChanges(repoPath: string): { success: boolean; error?: string } {
  try {
    LogService.getInstance().info(`Staging all changes in: ${repoPath}`, 'stageAllChanges');

    execSync('git add -A', {
      cwd: repoPath,
      stdio: 'pipe',
    });

    // Check if anything was actually staged
    try {
      execSync('git diff --cached --quiet', {
        cwd: repoPath,
        stdio: 'pipe',
      });
      // If this succeeds, nothing is staged
      LogService.getInstance().warn(`No changes were staged in: ${repoPath}`, 'stageAllChanges');
    } catch {
      // Good - there are staged changes
      LogService.getInstance().info(`Changes staged successfully in: ${repoPath}`, 'stageAllChanges');
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    LogService.getInstance().error(`Failed to stage changes in ${repoPath}: ${errorMsg}`, 'stageAllChanges');
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Commit staged changes with a message
 */
export function commitChanges(
  repoPath: string,
  message: string
): { success: boolean; error?: string } {
  try {
    LogService.getInstance().info(`Committing changes in: ${repoPath}`, 'commitChanges');
    LogService.getInstance().info(`Commit message: ${message}`, 'commitChanges');

    // Check if there are staged changes before committing
    const stagedCheck = execSync('git diff --cached --quiet', {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch (stagedError) {
    // git diff --cached --quiet exits with 1 if there ARE staged changes (which is good)
    // This is expected behavior - continue with commit
  }

  try {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });

    LogService.getInstance().info(`Commit successful in: ${repoPath}`, 'commitChanges');
    return { success: true };
  } catch (error: unknown) {
    // Try to get more detailed error info
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
      // execSync errors have stderr in the error object
      const execError = error as Error & { stderr?: Buffer | string };
      if (execError.stderr) {
        const stderr = typeof execError.stderr === 'string'
          ? execError.stderr
          : execError.stderr.toString();
        if (stderr.trim()) {
          errorMessage = stderr.trim();
        }
      }
    }
    LogService.getInstance().error(`Commit failed in ${repoPath}: ${errorMessage}`, 'commitChanges');
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Stash uncommitted changes
 */
export function stashChanges(repoPath: string): { success: boolean; error?: string } {
  try {
    execSync('git stash push -u -m "dmux: auto-stash before merge"', {
      cwd: repoPath,
      stdio: 'pipe',
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
