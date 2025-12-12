/**
 * Multi-Merge Orchestrator
 *
 * Coordinates merging multiple worktrees in sequence with proper
 * dialog handling and error recovery.
 */

import type { ActionResult, ActionContext } from '../types.js';
import type { DmuxPane } from '../../types.js';
import type { WorktreeInfo, MergeQueueItem, MultiMergeResult } from './types.js';
import type { MergeValidationResult } from '../../utils/mergeValidation.js';
import { getWorktreeDisplayLabel } from '../../utils/worktreeDiscovery.js';

/**
 * Build the merge queue from detected worktrees
 * - Runs validation on each worktree
 * - Filters to only those with changes to merge
 * - Already sorted by depth (deepest first from detectAllWorktrees)
 */
export async function buildMergeQueue(
  worktrees: WorktreeInfo[]
): Promise<MergeQueueItem[]> {
  const { validateMerge } = await import('../../utils/mergeValidation.js');
  const queue: MergeQueueItem[] = [];

  for (const worktree of worktrees) {
    const validation = validateMerge(
      worktree.parentRepoPath,
      worktree.worktreePath,
      worktree.branch
    );

    // Include if there's something to merge (has issues that can be resolved, or can merge)
    // Exclude only if the ONLY issue is 'nothing_to_merge'
    const hasNothingToMerge = validation.issues.some(i => i.type === 'nothing_to_merge');
    const hasOnlyNothingToMerge = validation.issues.length === 1 && hasNothingToMerge;

    if (!hasOnlyNothingToMerge) {
      queue.push({
        worktree,
        validation,
        status: 'pending',
      });
    }
  }

  return queue;
}

/**
 * Execute multi-merge with sequential dialogs
 * Returns ActionResult that chains through each merge
 */
export async function executeMultiMerge(
  pane: DmuxPane,
  context: ActionContext,
  queue: MergeQueueItem[]
): Promise<ActionResult> {
  // Start with confirmation dialog
  return showMultiMergeConfirmation(pane, context, queue);
}

/**
 * Show initial confirmation dialog listing all worktrees to merge
 */
function showMultiMergeConfirmation(
  pane: DmuxPane,
  context: ActionContext,
  queue: MergeQueueItem[]
): ActionResult {
  const worktreeList = queue
    .map((item, idx) => {
      const label = getWorktreeDisplayLabel(item.worktree);
      const issues = item.validation.issues
        .filter(i => i.type !== 'nothing_to_merge')
        .map(i => i.type.replace(/_/g, ' '))
        .join(', ');
      return ` ${idx + 1}. ${label}${issues ? ` [${issues}]` : ''}`;
    })
    .join('\n');

  return {
    type: 'confirm',
    title: 'Multi-Repository Merge',
    message: `Merge ${queue.length} repositor${queue.length === 1 ? 'y' : 'ies'}?\n\n${worktreeList}`,
    confirmLabel: 'Start Merge',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      // Initialize result tracking
      const result: MultiMergeResult = {
        totalWorktrees: queue.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };

      // Start processing the queue
      return processNextInQueue(pane, context, queue, 0, result);
    },
    onCancel: async () => {
      return {
        type: 'info',
        message: 'Multi-merge cancelled',
        dismissable: true,
      };
    },
  };
}

/**
 * Process the next item in the merge queue
 */
async function processNextInQueue(
  pane: DmuxPane,
  context: ActionContext,
  queue: MergeQueueItem[],
  currentIndex: number,
  result: MultiMergeResult
): Promise<ActionResult> {
  // Check if we're done
  if (currentIndex >= queue.length) {
    return showMultiMergeSummary(pane, context, result);
  }

  const item = queue[currentIndex];
  const worktreeLabel = getWorktreeDisplayLabel(item.worktree);

  // Show progress
  console.error(`[multiMerge] Processing ${currentIndex + 1}/${queue.length}: ${worktreeLabel}`);

  // Update status
  item.status = 'in_progress';

  // Execute the merge for this worktree
  return executeSingleWorktreeMerge(
    pane,
    context,
    item,
    currentIndex,
    queue.length,
    async (success: boolean, error?: string) => {
      // Record result
      if (success) {
        item.status = 'completed';
        result.successful++;
        result.results.push({
          worktree: item.worktree,
          status: 'completed',
        });
      } else if (error === 'skipped') {
        item.status = 'skipped';
        result.skipped++;
        result.results.push({
          worktree: item.worktree,
          status: 'skipped',
        });
      } else {
        item.status = 'failed';
        item.error = error;
        result.failed++;
        result.results.push({
          worktree: item.worktree,
          status: 'failed',
          error,
        });
      }

      // Process next item
      return processNextInQueue(pane, context, queue, currentIndex + 1, result);
    }
  );
}

/**
 * Execute merge for a single worktree in the queue
 */
async function executeSingleWorktreeMerge(
  pane: DmuxPane,
  context: ActionContext,
  item: MergeQueueItem,
  currentIndex: number,
  totalCount: number,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { validation, worktree } = item;
  const worktreeLabel = getWorktreeDisplayLabel(worktree);
  const progressPrefix = `[${currentIndex + 1}/${totalCount}] ${worktreeLabel}`;

  // Handle issues first (same as single merge flow)
  if (!validation.canMerge) {
    return handleWorktreeMergeIssues(
      pane,
      context,
      item,
      progressPrefix,
      onComplete
    );
  }

  // No issues - show confirmation for this worktree
  return {
    type: 'confirm',
    title: progressPrefix,
    message: `Merge "${worktree.branch}" into ${validation.mainBranch}?`,
    confirmLabel: 'Merge',
    cancelLabel: 'Skip',
    onConfirm: async () => {
      return performWorktreeMerge(pane, context, item, progressPrefix, onComplete);
    },
    onCancel: async () => {
      // Skip this worktree, continue with others
      return onComplete(false, 'skipped');
    },
  };
}

/**
 * Handle merge issues for a single worktree in multi-merge context
 */
async function handleWorktreeMergeIssues(
  pane: DmuxPane,
  context: ActionContext,
  item: MergeQueueItem,
  progressPrefix: string,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { validation, worktree } = item;
  const { issues, mainBranch } = validation;

  // Create retry function for this specific worktree
  const retryMerge = async (): Promise<ActionResult> => {
    // Re-validate
    const { validateMerge } = await import('../../utils/mergeValidation.js');
    item.validation = validateMerge(
      worktree.parentRepoPath,
      worktree.worktreePath,
      worktree.branch
    );

    if (item.validation.canMerge) {
      return performWorktreeMerge(pane, context, item, progressPrefix, onComplete);
    } else {
      return handleWorktreeMergeIssues(pane, context, item, progressPrefix, onComplete);
    }
  };

  // Check for nothing to merge
  const nothingToMerge = issues.find(i => i.type === 'nothing_to_merge');
  if (nothingToMerge) {
    return onComplete(false, 'skipped');
  }

  // Check for main dirty
  const mainDirty = issues.find(i => i.type === 'main_dirty');
  if (mainDirty) {
    return handleMainDirtyForWorktree(
      item,
      progressPrefix,
      mainBranch,
      retryMerge,
      onComplete
    );
  }

  // Check for worktree uncommitted
  const worktreeUncommitted = issues.find(i => i.type === 'worktree_uncommitted');
  if (worktreeUncommitted) {
    return handleUncommittedForWorktree(
      item,
      progressPrefix,
      retryMerge,
      onComplete
    );
  }

  // Check for merge conflict
  const mergeConflict = issues.find(i => i.type === 'merge_conflict');
  if (mergeConflict) {
    return handleConflictForWorktree(
      pane,
      context,
      item,
      progressPrefix,
      mainBranch,
      onComplete
    );
  }

  // Unknown issue - skip with error
  return onComplete(false, issues.map(i => i.message).join('; '));
}

/**
 * Handle main branch dirty for a worktree in multi-merge
 */
async function handleMainDirtyForWorktree(
  item: MergeQueueItem,
  progressPrefix: string,
  mainBranch: string,
  retryMerge: () => Promise<ActionResult>,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { worktree, validation } = item;
  const issue = validation.issues.find(i => i.type === 'main_dirty')!;
  const files = issue.files || [];

  return {
    type: 'choice',
    title: `${progressPrefix}: Main Branch Has Changes`,
    message: `${mainBranch} in ${worktree.repoName} has uncommitted changes:\n${files.slice(0, 3).map(f => ` • ${f}`).join('\n')}${files.length > 3 ? '\n  ...' : ''}`,
    options: [
      {
        id: 'commit_automatic',
        label: 'AI commit (automatic)',
        description: 'Auto-generate and commit immediately',
        default: true,
      },
      {
        id: 'commit_ai_editable',
        label: 'AI commit (editable)',
        description: 'Generate message, edit before commit',
      },
      {
        id: 'commit_manual',
        label: 'Manual commit message',
        description: 'Write your own commit message',
      },
      {
        id: 'skip',
        label: 'Skip this repo',
        description: 'Continue with other repositories',
      },
    ],
    onSelect: async (optionId: string) => {
      if (optionId === 'skip') {
        return onComplete(false, 'skipped');
      }

      if (
        optionId === 'commit_automatic' ||
        optionId === 'commit_ai_editable' ||
        optionId === 'commit_manual'
      ) {
        const { handleCommitWithOptions } = await import('./commitMessageHandler.js');
        return handleCommitWithOptions(
          worktree.parentRepoPath,
          optionId as 'commit_automatic' | 'commit_ai_editable' | 'commit_manual',
          retryMerge
        );
      }

      return onComplete(false, 'Unknown option');
    },
    dismissable: false,
  };
}

/**
 * Handle uncommitted changes in worktree for multi-merge
 */
async function handleUncommittedForWorktree(
  item: MergeQueueItem,
  progressPrefix: string,
  retryMerge: () => Promise<ActionResult>,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { worktree, validation } = item;
  const issue = validation.issues.find(i => i.type === 'worktree_uncommitted')!;
  const files = issue.files || [];

  return {
    type: 'choice',
    title: `${progressPrefix}: Uncommitted Changes`,
    message: `${worktree.repoName} worktree has uncommitted changes:\n${files.slice(0, 3).map(f => ` • ${f}`).join('\n')}${files.length > 3 ? '\n  ...' : ''}`,
    options: [
      {
        id: 'commit_automatic',
        label: 'AI commit (automatic)',
        description: 'Auto-generate and commit immediately',
        default: true,
      },
      {
        id: 'commit_ai_editable',
        label: 'AI commit (editable)',
        description: 'Generate message, edit before commit',
      },
      {
        id: 'commit_manual',
        label: 'Manual commit message',
        description: 'Write your own commit message',
      },
      {
        id: 'skip',
        label: 'Skip this repo',
        description: 'Continue with other repositories',
      },
    ],
    onSelect: async (optionId: string) => {
      if (optionId === 'skip') {
        return onComplete(false, 'skipped');
      }

      if (
        optionId === 'commit_automatic' ||
        optionId === 'commit_ai_editable' ||
        optionId === 'commit_manual'
      ) {
        const { handleCommitWithOptions } = await import('./commitMessageHandler.js');
        return handleCommitWithOptions(
          worktree.worktreePath,
          optionId as 'commit_automatic' | 'commit_ai_editable' | 'commit_manual',
          retryMerge
        );
      }

      return onComplete(false, 'Unknown option');
    },
    dismissable: false,
  };
}

/**
 * Handle merge conflict for a worktree in multi-merge
 */
async function handleConflictForWorktree(
  pane: DmuxPane,
  context: ActionContext,
  item: MergeQueueItem,
  progressPrefix: string,
  mainBranch: string,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { worktree, validation } = item;
  const issue = validation.issues.find(i => i.type === 'merge_conflict')!;
  const files = issue.files || [];

  return {
    type: 'choice',
    title: `${progressPrefix}: Merge Conflicts`,
    message: `Conflicts detected in ${worktree.repoName}:\n${files.slice(0, 3).map(f => ` • ${f}`).join('\n')}${files.length > 3 ? '\n  ...' : ''}`,
    options: [
      {
        id: 'skip',
        label: 'Skip this repo',
        description: 'Resolve conflicts manually later',
        default: true,
      },
      {
        id: 'abort',
        label: 'Stop multi-merge',
        description: 'Abort remaining merges',
      },
    ],
    onSelect: async (optionId: string) => {
      if (optionId === 'skip') {
        return onComplete(false, 'skipped');
      }
      if (optionId === 'abort') {
        return {
          type: 'info',
          title: 'Multi-Merge Aborted',
          message: `Stopped at ${worktree.repoName} due to conflicts.`,
          dismissable: true,
        };
      }
      return onComplete(false, 'Unknown option');
    },
    dismissable: false,
  };
}

/**
 * Actually perform the merge for a worktree
 */
async function performWorktreeMerge(
  pane: DmuxPane,
  context: ActionContext,
  item: MergeQueueItem,
  progressPrefix: string,
  onComplete: (success: boolean, error?: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { worktree, validation } = item;
  const { mainBranch } = validation;

  const { mergeMainIntoWorktree, mergeWorktreeIntoMain } = await import(
    '../../utils/mergeExecution.js'
  );
  const { triggerHook } = await import('../../utils/hooks.js');

  // Trigger pre_merge hook
  await triggerHook('pre_merge', worktree.parentRepoPath, pane, {
    DMUX_TARGET_BRANCH: mainBranch,
    DMUX_WORKTREE_PATH: worktree.worktreePath,
    DMUX_REPO_NAME: worktree.repoName,
  });

  // Step 1: Merge main into worktree
  const step1 = mergeMainIntoWorktree(worktree.worktreePath, mainBranch);

  if (!step1.success) {
    if (step1.needsManualResolution && step1.conflictFiles?.length) {
      // Conflict occurred during merge
      return {
        type: 'choice',
        title: `${progressPrefix}: Merge Conflict`,
        message: `Conflict while merging ${mainBranch} into worktree:\n${step1.conflictFiles.slice(0, 3).map(f => ` • ${f}`).join('\n')}`,
        options: [
          {
            id: 'skip',
            label: 'Skip this repo',
            description: 'Abort this merge, continue with others',
            default: true,
          },
          {
            id: 'abort_all',
            label: 'Stop multi-merge',
            description: 'Stop processing remaining repos',
          },
        ],
        onSelect: async (optionId: string) => {
          const { abortMerge } = await import('../../utils/mergeExecution.js');
          abortMerge(worktree.worktreePath);

          if (optionId === 'abort_all') {
            return {
              type: 'info',
              title: 'Multi-Merge Aborted',
              message: `Stopped due to conflicts in ${worktree.repoName}`,
              dismissable: true,
            };
          }
          return onComplete(false, 'skipped');
        },
        dismissable: false,
      };
    }

    return onComplete(false, `Merge failed: ${step1.error}`);
  }

  // Step 2: Merge worktree into main
  const step2 = mergeWorktreeIntoMain(worktree.parentRepoPath, worktree.branch);

  if (!step2.success) {
    return onComplete(false, `Failed to merge into ${mainBranch}: ${step2.error}`);
  }

  // Trigger post_merge hook
  await triggerHook('post_merge', worktree.parentRepoPath, pane, {
    DMUX_TARGET_BRANCH: mainBranch,
    DMUX_WORKTREE_PATH: worktree.worktreePath,
    DMUX_REPO_NAME: worktree.repoName,
  });

  console.error(`[multiMerge] Successfully merged ${worktree.repoName}`);
  return onComplete(true);
}

/**
 * Show final summary of multi-merge operation
 */
function showMultiMergeSummary(
  pane: DmuxPane,
  context: ActionContext,
  result: MultiMergeResult
): ActionResult {
  const summaryLines = result.results.map(r => {
    const label = getWorktreeDisplayLabel(r.worktree);
    const icon = r.status === 'completed' ? '✓' : r.status === 'skipped' ? '○' : '✗';
    const suffix = r.error && r.status === 'failed' ? ` (${r.error})` : '';
    return ` ${icon} ${label}${suffix}`;
  });

  const message = [
    `Completed: ${result.successful}`,
    result.skipped > 0 ? `Skipped: ${result.skipped}` : null,
    result.failed > 0 ? `Failed: ${result.failed}` : null,
    '',
    ...summaryLines,
  ]
    .filter(Boolean)
    .join('\n');

  // If all successful, offer to close pane
  if (result.failed === 0 && result.successful > 0) {
    return {
      type: 'confirm',
      title: 'Multi-Merge Complete',
      message,
      confirmLabel: 'Close Pane',
      cancelLabel: 'Keep Open',
      onConfirm: async () => {
        const { closePane } = await import('../implementations/closeAction.js');
        return closePane(pane, context);
      },
      onCancel: async () => {
        return {
          type: 'success',
          message: 'Merges complete. Pane kept open.',
          dismissable: true,
        };
      },
    };
  }

  // Some failures - just show info
  return {
    type: 'info',
    title: result.failed > 0 ? 'Multi-Merge Partial' : 'Multi-Merge Complete',
    message,
    dismissable: true,
  };
}
