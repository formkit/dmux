/**
 * Merge Execution Utilities
 *
 * Handles the actual merge operations with proper error handling
 */

import { execSync } from 'child_process';

export interface MergeResult {
  success: boolean;
  error?: string;
  conflictFiles?: string[];
  needsManualResolution?: boolean;
}

/**
 * Merge main branch into worktree branch
 * This is step 1 of the two-phase merge: get latest changes from main
 */
export function mergeMainIntoWorktree(
  worktreePath: string,
  mainBranch: string
): MergeResult {
  try {
    execSync(`git merge ${mainBranch} --no-edit`, {
      cwd: worktreePath,
      stdio: 'pipe',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a merge conflict
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict')) {
      // Get list of conflicting files BEFORE aborting
      const conflictFiles = getConflictingFiles(worktreePath);

      // CRITICAL: Abort the merge to return worktree to clean state
      // This prevents conflict markers from being left in files
      abortMerge(worktreePath);

      return {
        success: false,
        error: 'Merge conflicts detected',
        conflictFiles,
        needsManualResolution: true,
      };
    }

    // For non-conflict errors, also abort if we're in merge state
    if (isInMergeState(worktreePath)) {
      abortMerge(worktreePath);
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Merge worktree branch into main (should be clean after resolving conflicts)
 * This is step 2 of the two-phase merge: bring changes back to main
 */
export function mergeWorktreeIntoMain(
  mainRepoPath: string,
  worktreeBranch: string
): MergeResult {
  try {
    execSync(`git merge ${worktreeBranch} --no-edit`, {
      cwd: mainRepoPath,
      stdio: 'pipe',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // This shouldn't have conflicts if we properly merged main into worktree first
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict')) {
      const conflictFiles = getConflictingFiles(mainRepoPath);

      return {
        success: false,
        error: 'Unexpected merge conflicts in main',
        conflictFiles,
        needsManualResolution: true,
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get list of files with merge conflicts
 */
export function getConflictingFiles(repoPath: string): string[] {
  try {
    const output = execSync('git diff --name-only --diff-filter=U', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return output
      .trim()
      .split('\n')
      .filter(line => line.trim());
  } catch {
    return [];
  }
}

/**
 * Abort an in-progress merge
 */
export function abortMerge(repoPath: string): { success: boolean; error?: string } {
  try {
    execSync('git merge --abort', {
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

/**
 * Check if repository is in a merge state
 */
export function isInMergeState(repoPath: string): boolean {
  try {
    const output = execSync('git status', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return output.includes('You have unmerged paths') ||
           output.includes('All conflicts fixed but you are still merging');
  } catch {
    return false;
  }
}

/**
 * Complete a merge after conflicts are resolved
 */
export function completeMerge(repoPath: string, message?: string): MergeResult {
  try {
    // Check if all conflicts are resolved
    const conflictFiles = getConflictingFiles(repoPath);
    if (conflictFiles.length > 0) {
      return {
        success: false,
        error: 'Not all conflicts have been resolved',
        conflictFiles,
        needsManualResolution: true,
      };
    }

    // Complete the merge
    const commitMsg = message || 'Merge branch with resolved conflicts';
    execSync(`git commit --no-gpg-sign -m "${commitMsg.replace(/"/g, '\\"')}"`, {
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

/**
 * Clean up worktree and branch after successful merge
 */
export function cleanupAfterMerge(
  mainRepoPath: string,
  worktreePath: string,
  branchName: string
): { success: boolean; error?: string } {
  try {
    // Remove worktree
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: mainRepoPath,
      stdio: 'pipe',
    });

    // Delete branch (use -d for safety, it will fail if not merged)
    execSync(`git branch -d ${branchName}`, {
      cwd: mainRepoPath,
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

/**
 * Get merge status summary for user display
 */
export function getMergeStatus(repoPath: string): string {
  try {
    const output = execSync('git status --short', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return output.trim();
  } catch {
    return '';
  }
}
