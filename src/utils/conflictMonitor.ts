/**
 * Conflict Monitor - Monitors a pane for merge conflict resolution completion
 *
 * When conflicts are resolved and merge commit is made, automatically:
 * 1. Closes the conflict resolution pane
 * 2. Triggers cleanup flow
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';

export interface ConflictMonitorOptions {
  conflictPaneId: string;  // tmux pane ID to monitor
  repoPath: string;        // Repository path to check git status
  onResolved: () => void;  // Callback when conflicts are resolved
  checkIntervalMs?: number;
  maxChecks?: number;
}

/**
 * Start monitoring a pane for conflict resolution completion
 * Returns a cleanup function to stop monitoring
 */
export function startConflictMonitoring(options: ConflictMonitorOptions): () => void {
  const {
    conflictPaneId,
    repoPath,
    onResolved,
    checkIntervalMs = 2000, // Check every 2 seconds
    maxChecks = 300,        // Stop after 10 minutes (300 * 2s)
  } = options;

  let checkCount = 0;
  let stopped = false;

  const checkInterval = setInterval(() => {
    if (stopped || checkCount >= maxChecks) {
      clearInterval(checkInterval);
      return;
    }

    checkCount++;

    try {
      // Check if pane still exists
      const paneExists = checkPaneExists(conflictPaneId);
      if (!paneExists) {
        // Pane was manually closed, stop monitoring
        clearInterval(checkInterval);
        return;
      }

      // Check if conflicts are resolved
      const conflictsResolved = areConflictsResolved(repoPath);

      if (conflictsResolved) {
        // Conflicts resolved! Trigger callback
        clearInterval(checkInterval);
        onResolved();
      }
    } catch (error) {
      // Ignore errors, keep monitoring
      console.error('[conflictMonitor] Error during check:', error);
    }
  }, checkIntervalMs);

  // Return cleanup function
  return () => {
    stopped = true;
    clearInterval(checkInterval);
  };
}

/**
 * Check if a tmux pane exists
 */
function checkPaneExists(paneId: string): boolean {
  try {
    execSync(`tmux display-message -t '${paneId}' -p '#{pane_id}'`, {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if merge conflicts are resolved in a repository
 * Returns true if:
 * - A new merge commit was created (HEAD moved and is a merge commit)
 * - No longer in merge state (MERGE_HEAD removed by commit)
 */
function areConflictsResolved(repoPath: string): boolean {
  try {
    // Check if we're still in merge state
    // In a worktree, MERGE_HEAD is in .git/worktrees/<name>/MERGE_HEAD
    // Git automatically resolves .git paths correctly in worktrees
    let mergeHeadExists = false;
    try {
      execSync('git rev-parse --verify MERGE_HEAD', {
        cwd: repoPath,
        stdio: 'pipe',
      });
      mergeHeadExists = true;
    } catch {
      mergeHeadExists = false;
    }

    // If MERGE_HEAD exists, we're still mid-merge (not yet committed)
    if (mergeHeadExists) {
      return false;
    }

    // Check if the most recent commit is a merge commit
    // This indicates the agent successfully committed the merge
    let isMergeCommit = false;
    try {
      execSync('git rev-parse --verify HEAD^2', {
        cwd: repoPath,
        stdio: 'pipe',
      });
      isMergeCommit = true;
    } catch {
      isMergeCommit = false;
    }

    // Conflicts are resolved when:
    // 1. No MERGE_HEAD (merge was committed or aborted)
    // 2. HEAD is a merge commit (has 2 parents)
    //
    // Note: In conflict resolution, we initiated a merge that had conflicts,
    // so it cannot be fast-forward. The result must be a merge commit.
    // If there's no MERGE_HEAD but also no merge commit, the agent may have
    // aborted or done something unexpected - treat as not resolved.
    return isMergeCommit;
  } catch {
    return false;
  }
}
