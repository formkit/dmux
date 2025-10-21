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
 * - No conflicting files remain (git diff --name-only --diff-filter=U is empty)
 * - Not in merge state (no MERGE_HEAD file)
 */
function areConflictsResolved(repoPath: string): boolean {
  try {
    // Check for conflicting files
    const conflictFiles = execSync('git diff --name-only --diff-filter=U', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // If there are still conflicts, not resolved
    if (conflictFiles.length > 0) {
      return false;
    }

    // Check if we're still in merge state
    const mergeHeadExists = execSync('test -f .git/MERGE_HEAD && echo "yes" || echo "no"', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    // If MERGE_HEAD exists, we're still mid-merge
    if (mergeHeadExists === 'yes') {
      return false;
    }

    // No conflicts and not in merge state = resolved!
    return true;
  } catch {
    return false;
  }
}
