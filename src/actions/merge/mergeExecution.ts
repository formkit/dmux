/**
 * Merge Execution - UI logic for merge execution workflows
 *
 * This module handles ActionResult flows for executing merges with
 * conflict handling, cleanup, and post-merge actions.
 */

import type { ActionResult, ActionContext } from '../types.js';
import type { DmuxPane } from '../../types.js';
import { triggerHook } from '../../utils/hooks.js';

/**
 * Execute merge with conflict handling
 */
export async function executeMergeWithConflictHandling(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string,
  strategy: 'manual' | 'ai'
): Promise<ActionResult> {
  const { mergeMainIntoWorktree, completeMerge } = await import('../../utils/mergeExecution.js');

  // Step 1: Merge main into worktree
  const result = mergeMainIntoWorktree(pane.worktreePath!, mainBranch);

  if (!result.success && result.needsManualResolution) {
    if (strategy === 'ai') {
      // Try AI resolution
      const { aiResolveAllConflicts } = await import('../../utils/aiMerge.js');
      const aiResult = await aiResolveAllConflicts(pane.worktreePath!, result.conflictFiles || []);

      if (aiResult.success) {
        // AI resolved all conflicts, complete the merge
        const completeResult = completeMerge(pane.worktreePath!, 'Merge with AI-resolved conflicts');

        if (completeResult.success) {
          // Continue with the second phase of merge
          return executeMerge(pane, context, mainBranch, mainRepoPath);
        } else {
          return {
            type: 'error',
            message: `Failed to complete merge: ${completeResult.error}`,
            dismissable: true,
          };
        }
      } else {
        // AI couldn't resolve, fall back to manual
        return {
          type: 'error',
          title: 'AI Merge Failed',
          message: `AI couldn't resolve conflicts in: ${aiResult.failedFiles.join(', ')}.\nPlease resolve manually.`,
          dismissable: true,
        };
      }
    } else {
      // Manual resolution - jump to pane
      return {
        type: 'navigation',
        title: 'Manual Conflict Resolution',
        message: `Conflicts in: ${result.conflictFiles?.join(', ')}.\nResolve in the pane, then try merge again.`,
        targetPaneId: pane.id,
        dismissable: true,
      };
    }
  }

  if (!result.success) {
    return {
      type: 'error',
      message: `Merge failed: ${result.error}`,
      dismissable: true,
    };
  }

  // No conflicts, proceed with the main merge
  return executeMerge(pane, context, mainBranch, mainRepoPath);
}

/**
 * Execute the actual merge operation (called after all pre-checks pass)
 * This implements the 2-phase merge:
 * 1. Merge main INTO worktree (to get latest changes and detect conflicts)
 * 2. Merge worktree INTO main (to bring changes back)
 */
export async function executeMerge(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string
): Promise<ActionResult> {
  const { mergeMainIntoWorktree, mergeWorktreeIntoMain, cleanupAfterMerge } = await import('../../utils/mergeExecution.js');

  // Step 1: Merge main into worktree first (get latest changes from main)
  const step1 = mergeMainIntoWorktree(pane.worktreePath!, mainBranch);

  if (!step1.success) {
    return {
      type: 'error',
      title: 'Merge Failed',
      message: `Failed to merge ${mainBranch} into worktree: ${step1.error}`,
      dismissable: true,
    };
  }

  // Step 2: Merge worktree into main (bring changes back to main)
  const step2 = mergeWorktreeIntoMain(mainRepoPath, pane.slug);

  if (!step2.success) {
    return {
      type: 'error',
      title: 'Merge Failed',
      message: `Failed to merge into ${mainBranch}: ${step2.error}`,
      dismissable: true,
    };
  }

  // Trigger post_merge hook after successful merge
  await triggerHook('post_merge', mainRepoPath, pane, {
    DMUX_TARGET_BRANCH: mainBranch,
  });

  // Merge successful! Ask about cleanup
  return {
    type: 'confirm',
    title: 'Merge Complete',
    message: `Successfully merged "${pane.slug}" into ${mainBranch}. Close the pane and cleanup worktree?`,
    confirmLabel: 'Yes, close it',
    cancelLabel: 'No, keep it',
    onConfirm: async () => {
      // Cleanup worktree and branch
      const cleanup = cleanupAfterMerge(mainRepoPath, pane.worktreePath!, pane.slug);

      if (!cleanup.success) {
        return {
          type: 'error',
          message: `Merge succeeded but cleanup failed: ${cleanup.error}`,
          dismissable: true,
        };
      }

      // Close the pane after cleanup
      // Update context to remove the pane from the list
      const updatedPanes = context.panes.filter(p => p.id !== pane.id);
      await context.savePanes(updatedPanes);

      // Notify about pane removal if callback exists
      if (context.onPaneUpdate) {
        context.onPaneUpdate(pane);
      }

      return {
        type: 'success',
        message: `Successfully merged and cleaned up "${pane.slug}"`,
        dismissable: true,
      };
    },
    onCancel: async () => {
      return {
        type: 'success',
        message: 'Merge complete. Pane kept open.',
        dismissable: true,
      };
    },
  };
}
