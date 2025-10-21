/**
 * MERGE Action - Merge a worktree into the main branch with comprehensive pre-checks
 *
 * This is the simplified orchestrator that delegates to specialized modules.
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { triggerHook } from '../../utils/hooks.js';
import { executeMerge } from '../merge/mergeExecution.js';
import {
  handleNothingToMerge,
  handleMainDirty,
  handleWorktreeUncommitted,
  handleMergeConflict,
} from '../merge/issueHandlers/index.js';

/**
 * Merge a worktree into the main branch with comprehensive pre-checks
 */
export async function mergePane(
  pane: DmuxPane,
  context: ActionContext,
  params?: { mainBranch?: string }
): Promise<ActionResult> {
  // 1. Validation
  if (!pane.worktreePath) {
    return {
      type: 'error',
      message: 'This pane has no worktree to merge',
      dismissable: true,
    };
  }

  // 2. Pre-merge validation
  const { validateMerge } = await import('../../utils/mergeValidation.js');
  const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');
  const validation = validateMerge(mainRepoPath, pane.worktreePath, pane.slug);

  // 3. Handle detected issues
  if (!validation.canMerge) {
    return handleMergeIssues(pane, context, validation, mainRepoPath);
  }

  // 4. No issues detected, proceed with merge confirmation
  return {
    type: 'confirm',
    title: 'Merge Worktree',
    message: `Merge "${pane.slug}" into ${validation.mainBranch}?`,
    confirmLabel: 'Merge',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      // Trigger pre_merge hook before starting merge
      await triggerHook('pre_merge', mainRepoPath, pane, {
        DMUX_TARGET_BRANCH: validation.mainBranch,
      });
      return executeMerge(pane, context, validation.mainBranch, mainRepoPath);
    },
    onCancel: async () => {
      return {
        type: 'info',
        message: 'Merge cancelled',
        dismissable: true,
      };
    },
  };
}

/**
 * Handle detected merge issues by delegating to specialized handlers
 */
async function handleMergeIssues(
  pane: DmuxPane,
  context: ActionContext,
  validation: any,
  mainRepoPath: string
): Promise<ActionResult> {
  const { issues, mainBranch } = validation;

  // Create retry function that re-runs the merge
  const retryMerge = () => mergePane(pane, context, { mainBranch });

  // Find and handle specific issue types
  const nothingToMerge = issues.find((i: any) => i.type === 'nothing_to_merge');
  if (nothingToMerge) {
    return handleNothingToMerge();
  }

  const mainDirty = issues.find((i: any) => i.type === 'main_dirty');
  if (mainDirty) {
    return handleMainDirty(mainDirty, mainBranch, mainRepoPath, pane, context, retryMerge);
  }

  const worktreeUncommitted = issues.find((i: any) => i.type === 'worktree_uncommitted');
  if (worktreeUncommitted) {
    return handleWorktreeUncommitted(worktreeUncommitted, pane, context, retryMerge);
  }

  const mergeConflict = issues.find((i: any) => i.type === 'merge_conflict');
  if (mergeConflict) {
    return handleMergeConflict(mergeConflict, mainBranch, mainRepoPath, pane, context);
  }

  // Generic fallback for unknown issues
  return {
    type: 'error',
    title: 'Merge Issues Detected',
    message: issues.map((i: any) => i.message).join('\n'),
    dismissable: true,
  };
}
