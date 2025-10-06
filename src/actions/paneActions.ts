/**
 * Standardized Pane Actions
 *
 * Core action implementations that work across all interfaces.
 * Each action returns a standardized ActionResult that interfaces can handle.
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';
import type { ActionResult, ActionContext, ActionOption } from './types.js';

/**
 * Generate commit message with timeout and error handling
 * Returns null if it fails, so caller can fall back to manual input
 */
async function generateCommitMessageSafe(
  repoPath: string,
  timeoutMs: number = 15000
): Promise<string | null> {
  try {
    const { generateCommitMessage } = await import('../utils/aiMerge.js');

    // Race between generation and timeout
    const result = await Promise.race([
      generateCommitMessage(repoPath),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    if (!result) {
      console.error('[generateCommitMessageSafe] AI generation returned null');
    }

    return result;
  } catch (error) {
    console.error('[generateCommitMessageSafe] Error or timeout:', error);
    return null;
  }
}

/**
 * View/Jump to a pane
 */
export async function viewPane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  try {
    execSync(`tmux select-pane -t '${pane.paneId}'`, { stdio: 'pipe' });

    return {
      type: 'navigation',
      message: `Jumped to pane: ${pane.slug}`,
      targetPaneId: pane.id,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: 'Failed to jump to pane - it may have been closed',
      dismissable: true,
    };
  }
}

/**
 * Close a pane - presents options for how to close
 */
export async function closePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  const options: ActionOption[] = [
    {
      id: 'kill_only',
      label: 'Just close pane',
      description: 'Keep worktree and branch',
      default: true,
    },
  ];

  if (pane.worktreePath) {
    options.push(
      {
        id: 'kill_and_clean',
        label: 'Close and remove worktree',
        description: 'Delete worktree but keep branch',
        danger: true,
      },
      {
        id: 'kill_clean_branch',
        label: 'Close and delete everything',
        description: 'Remove worktree and delete branch',
        danger: true,
      }
    );
  }

  return {
    type: 'choice',
    title: 'Close Pane',
    message: `How do you want to close "${pane.slug}"?`,
    options,
    onSelect: async (optionId: string) => {
      return executeCloseOption(pane, context, optionId);
    },
    dismissable: true,
  };
}

/**
 * Execute the selected close option
 */
async function executeCloseOption(
  pane: DmuxPane,
  context: ActionContext,
  option: string
): Promise<ActionResult> {
  try {
    // Kill the tmux pane
    try {
      execSync(`tmux kill-pane -t '${pane.paneId}'`, { stdio: 'pipe' });
    } catch {
      // Pane might already be dead
    }

    // Handle worktree cleanup based on option
    if (pane.worktreePath && (option === 'kill_and_clean' || option === 'kill_clean_branch')) {
      const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

      try {
        execSync(`git worktree remove "${pane.worktreePath}" --force`, {
          stdio: 'pipe',
          cwd: mainRepoPath,
        });
      } catch {
        // Worktree might already be removed
      }

      // Delete branch if requested
      if (option === 'kill_clean_branch') {
        try {
          execSync(`git branch -D ${pane.slug}`, {
            stdio: 'pipe',
            cwd: mainRepoPath,
          });
        } catch {
          // Branch might not exist or already deleted
        }
      }
    }

    // Remove from panes list
    const updatedPanes = context.panes.filter(p => p.id !== pane.id);
    await context.savePanes(updatedPanes);

    if (context.onPaneRemove) {
      context.onPaneRemove(pane.id);
    }

    return {
      type: 'success',
      message: `Pane "${pane.slug}" closed successfully`,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to close pane: ${error}`,
      dismissable: true,
    };
  }
}

/**
 * Merge a worktree into the main branch with comprehensive pre-checks
 */
export async function mergePane(
  pane: DmuxPane,
  context: ActionContext,
  params?: { mainBranch?: string }
): Promise<ActionResult> {
  if (!pane.worktreePath) {
    return {
      type: 'error',
      message: 'This pane has no worktree to merge',
      dismissable: true,
    };
  }

  // Import merge utilities dynamically
  const { validateMerge } = await import('../utils/mergeValidation.js');
  const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

  // Run pre-merge validation
  const validation = validateMerge(mainRepoPath, pane.worktreePath, pane.slug);

  // If there are issues, present them to the user
  if (!validation.canMerge) {
    return handleMergeIssues(pane, context, validation, mainRepoPath);
  }

  // No issues detected, proceed with merge confirmation
  return {
    type: 'confirm',
    title: 'Merge Worktree',
    message: `Merge "${pane.slug}" into ${validation.mainBranch}?`,
    confirmLabel: 'Merge',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
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
 * Handle detected merge issues
 */
async function handleMergeIssues(
  pane: DmuxPane,
  context: ActionContext,
  validation: any,
  mainRepoPath: string
): Promise<ActionResult> {
  const { issues, mainBranch } = validation;
  const { commitChanges, stashChanges } = await import('../utils/mergeValidation.js');
  const { generateCommitMessage } = await import('../utils/aiMerge.js');

  // Group issues by type for clearer handling
  const mainDirty = issues.find((i: any) => i.type === 'main_dirty');
  const worktreeUncommitted = issues.find((i: any) => i.type === 'worktree_uncommitted');
  const mergeConflict = issues.find((i: any) => i.type === 'merge_conflict');
  const nothingToMerge = issues.find((i: any) => i.type === 'nothing_to_merge');

  // Handle "nothing to merge" case
  if (nothingToMerge) {
    return {
      type: 'info',
      message: 'No new commits to merge',
      dismissable: true,
    };
  }

  // Handle main branch dirty
  if (mainDirty) {
    return {
      type: 'choice',
      title: 'Main Branch Has Uncommitted Changes',
      message: `${mainBranch} has uncommitted changes in:\n${mainDirty.files.slice(0, 5).join('\n')}${mainDirty.files.length > 5 ? '\n...' : ''}`,
      options: [
        {
          id: 'commit_ai_editable',
          label: 'AI commit (editable)',
          description: 'Generate message from diff, edit before commit',
          default: true,
        },
        {
          id: 'commit_automatic',
          label: 'AI commit (automatic)',
          description: 'Auto-generate and commit immediately',
        },
        {
          id: 'commit_manual',
          label: 'Manual commit message',
          description: 'Write your own commit message',
        },
        {
          id: 'stash_main',
          label: 'Stash changes in main',
          description: 'Temporarily stash uncommitted changes',
        },
        {
          id: 'cancel',
          label: 'Cancel merge',
          description: 'Resolve manually later',
        },
      ],
      onSelect: async (optionId: string) => {
        if (optionId === 'cancel') {
          return { type: 'info', message: 'Merge cancelled', dismissable: true };
        }

        if (optionId === 'stash_main') {
          const result = stashChanges(mainRepoPath);
          if (!result.success) {
            return { type: 'error', message: `Stash failed: ${result.error}`, dismissable: true };
          }
          // Retry merge after stashing
          return mergePane(pane, context, { mainBranch });
        }

        if (optionId === 'commit_ai_editable') {
          try {
            const { stageAllChanges } = await import('../utils/mergeValidation.js');
            const { getComprehensiveDiff } = await import('../utils/aiMerge.js');

            // Stage all changes first
            const stageResult = stageAllChanges(mainRepoPath);
            if (!stageResult.success) {
              return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
            }

            // Get diff and generate message
            const { diff, summary } = getComprehensiveDiff(mainRepoPath);
            console.error('[commit_ai_editable] Calling generateCommitMessageSafe for main repo');
            const generatedMessage = await generateCommitMessageSafe(mainRepoPath);
            console.error('[commit_ai_editable] Generated message:', generatedMessage);

            // If AI generation failed, fall back to manual with explanation
            if (!generatedMessage) {
              console.error('[commit_ai_editable] Falling back to manual input');
              return {
                type: 'input',
                title: 'Enter Commit Message',
                message: `⚠️ Auto-generation failed or timed out. Please write a commit message manually.\n\nFiles changed:\n${summary}`,
                placeholder: 'feat: add new feature',
                onSubmit: async (message: string) => {
                  if (!message || !message.trim()) {
                    return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                  }
                  const result = commitChanges(mainRepoPath, message.trim());
                  if (!result.success) {
                    return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                  }
                  // Retry merge after committing
                  return mergePane(pane, context, { mainBranch });
                },
                dismissable: true,
              };
            }

            console.error('[commit_ai_editable] Returning editable input with generated message');
            return {
              type: 'input',
              title: 'Review & Edit Commit Message',
              message: `Files changed:\n${summary}\n\nGenerated message (edit as needed):`,
              placeholder: 'feat: add new feature',
              defaultValue: generatedMessage,
              onSubmit: async (message: string) => {
                if (!message || !message.trim()) {
                  return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                }
                const result = commitChanges(mainRepoPath, message.trim());
                if (!result.success) {
                  return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                }
                // Retry merge after committing
                return mergePane(pane, context, { mainBranch });
              },
              dismissable: true,
            };
          } catch (error) {
            console.error('[commit_ai_editable] Unexpected error:', error);
            return {
              type: 'error',
              message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              dismissable: true,
            };
          }
        }

        if (optionId === 'commit_automatic') {
          const { stageAllChanges } = await import('../utils/mergeValidation.js');
          const { getComprehensiveDiff } = await import('../utils/aiMerge.js');

          // Stage all changes first
          const stageResult = stageAllChanges(mainRepoPath);
          if (!stageResult.success) {
            return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
          }

          // Generate commit message
          const message = await generateCommitMessageSafe(mainRepoPath);

          // If AI generation failed, fall back to manual input
          if (!message) {
            const { summary } = getComprehensiveDiff(mainRepoPath);
            return {
              type: 'input',
              title: 'Enter Commit Message',
              message: `⚠️ Auto-generation failed or timed out. Please write a commit message manually.\n\nFiles changed:\n${summary}`,
              placeholder: 'feat: add new feature',
              onSubmit: async (manualMessage: string) => {
                if (!manualMessage || !manualMessage.trim()) {
                  return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                }
                const result = commitChanges(mainRepoPath, manualMessage.trim());
                if (!result.success) {
                  return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                }
                // Retry merge after committing
                return mergePane(pane, context, { mainBranch });
              },
              dismissable: true,
            };
          }

          const result = commitChanges(mainRepoPath, message);
          if (!result.success) {
            return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
          }
          // Retry merge after committing
          return mergePane(pane, context, { mainBranch });
        }

        if (optionId === 'commit_manual') {
          const { stageAllChanges } = await import('../utils/mergeValidation.js');

          // Stage all changes first
          const stageResult = stageAllChanges(mainRepoPath);
          if (!stageResult.success) {
            return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
          }

          return {
            type: 'input',
            title: 'Enter Commit Message',
            message: 'Write a commit message for the changes in main:',
            placeholder: 'feat: add new feature',
            onSubmit: async (message: string) => {
              if (!message || !message.trim()) {
                return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
              }
              const result = commitChanges(mainRepoPath, message.trim());
              if (!result.success) {
                return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
              }
              // Retry merge after committing
              return mergePane(pane, context, { mainBranch });
            },
            dismissable: true,
          };
        }

        return { type: 'info', message: 'Unknown option', dismissable: true };
      },
      dismissable: true,
    };
  }

  // Handle worktree uncommitted changes
  if (worktreeUncommitted) {
    return {
      type: 'choice',
      title: 'Worktree Has Uncommitted Changes',
      message: `Changes in:\n${worktreeUncommitted.files.slice(0, 5).join('\n')}${worktreeUncommitted.files.length > 5 ? '\n...' : ''}`,
      options: [
        {
          id: 'commit_ai_editable',
          label: 'AI commit (editable)',
          description: 'Generate message from diff, edit before commit',
          default: true,
        },
        {
          id: 'commit_automatic',
          label: 'AI commit (automatic)',
          description: 'Auto-generate and commit immediately',
        },
        {
          id: 'commit_manual',
          label: 'Manual commit message',
          description: 'Write your own commit message',
        },
        {
          id: 'cancel',
          label: 'Cancel merge',
          description: 'Resolve manually later',
        },
      ],
      onSelect: async (optionId: string) => {
        if (optionId === 'cancel') {
          return { type: 'info', message: 'Merge cancelled', dismissable: true };
        }

        if (optionId === 'commit_ai_editable') {
          try {
            const { stageAllChanges } = await import('../utils/mergeValidation.js');
            const { getComprehensiveDiff } = await import('../utils/aiMerge.js');

            // Stage all changes first
            const stageResult = stageAllChanges(pane.worktreePath!);
            if (!stageResult.success) {
              return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
            }

            // Get diff and generate message
            const { diff, summary } = getComprehensiveDiff(pane.worktreePath!);
            console.error('[worktree commit_ai_editable] Calling generateCommitMessageSafe');
            const generatedMessage = await generateCommitMessageSafe(pane.worktreePath!);
            console.error('[worktree commit_ai_editable] Generated message:', generatedMessage);

            // If AI generation failed, fall back to manual with explanation
            if (!generatedMessage) {
              console.error('[worktree commit_ai_editable] Falling back to manual input');
              return {
                type: 'input',
                title: 'Enter Commit Message',
                message: `⚠️ Auto-generation failed or timed out. Please write a commit message manually.\n\nFiles changed:\n${summary}`,
                placeholder: 'feat: add new feature',
                onSubmit: async (message: string) => {
                  if (!message || !message.trim()) {
                    return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                  }
                  const result = commitChanges(pane.worktreePath!, message.trim());
                  if (!result.success) {
                    return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                  }
                  // Retry merge after committing
                  return mergePane(pane, context, { mainBranch });
                },
                dismissable: true,
              };
            }

            console.error('[worktree commit_ai_editable] Returning editable input with generated message');
            return {
              type: 'input',
              title: 'Review & Edit Commit Message',
              message: `Files changed:\n${summary}\n\nGenerated message (edit as needed):`,
              placeholder: 'feat: add new feature',
              defaultValue: generatedMessage,
              onSubmit: async (message: string) => {
                if (!message || !message.trim()) {
                  return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                }
                const result = commitChanges(pane.worktreePath!, message.trim());
                if (!result.success) {
                  return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                }
                // Retry merge after committing
                return mergePane(pane, context, { mainBranch });
              },
              dismissable: true,
            };
          } catch (error) {
            console.error('[worktree commit_ai_editable] Unexpected error:', error);
            return {
              type: 'error',
              message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              dismissable: true,
            };
          }
        }

        if (optionId === 'commit_automatic') {
          const { stageAllChanges } = await import('../utils/mergeValidation.js');
          const { getComprehensiveDiff } = await import('../utils/aiMerge.js');

          // Stage all changes first
          const stageResult = stageAllChanges(pane.worktreePath!);
          if (!stageResult.success) {
            return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
          }

          const message = await generateCommitMessageSafe(pane.worktreePath!);

          // If AI generation failed, fall back to manual input
          if (!message) {
            const { summary } = getComprehensiveDiff(pane.worktreePath!);
            return {
              type: 'input',
              title: 'Enter Commit Message',
              message: `⚠️ Auto-generation failed or timed out. Please write a commit message manually.\n\nFiles changed:\n${summary}`,
              placeholder: 'feat: add new feature',
              onSubmit: async (manualMessage: string) => {
                if (!manualMessage || !manualMessage.trim()) {
                  return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
                }
                const result = commitChanges(pane.worktreePath!, manualMessage.trim());
                if (!result.success) {
                  return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
                }
                // Retry merge after committing
                return mergePane(pane, context, { mainBranch });
              },
              dismissable: true,
            };
          }

          const result = commitChanges(pane.worktreePath!, message);
          if (!result.success) {
            return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
          }
          // Retry merge after committing
          return mergePane(pane, context, { mainBranch });
        }

        if (optionId === 'commit_manual') {
          const { stageAllChanges } = await import('../utils/mergeValidation.js');

          // Stage all changes first
          const stageResult = stageAllChanges(pane.worktreePath!);
          if (!stageResult.success) {
            return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
          }

          return {
            type: 'input',
            title: 'Enter Commit Message',
            message: 'Write a commit message for the changes:',
            placeholder: 'feat: add new feature',
            onSubmit: async (message: string) => {
              if (!message || !message.trim()) {
                return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
              }
              const result = commitChanges(pane.worktreePath!, message.trim());
              if (!result.success) {
                return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
              }
              // Retry merge after committing
              return mergePane(pane, context, { mainBranch });
            },
            dismissable: true,
          };
        }

        return { type: 'info', message: 'Unknown option', dismissable: true };
      },
      dismissable: true,
    };
  }

  // Handle merge conflicts
  if (mergeConflict) {
    return {
      type: 'choice',
      title: 'Merge Conflicts Detected',
      message: `Conflicts will occur in:\n${mergeConflict.files.slice(0, 5).join('\n')}${mergeConflict.files.length > 5 ? '\n...' : ''}`,
      options: [
        {
          id: 'ai_merge',
          label: 'Try AI-assisted merge',
          description: 'Let AI intelligently combine both versions',
          default: true,
        },
        {
          id: 'manual_merge',
          label: 'Manual resolution',
          description: 'Jump to pane to resolve conflicts',
        },
        {
          id: 'cancel',
          label: 'Cancel merge',
          description: 'Do nothing',
        },
      ],
      onSelect: async (optionId: string) => {
        if (optionId === 'cancel') {
          return { type: 'info', message: 'Merge cancelled', dismissable: true };
        }

        if (optionId === 'manual_merge') {
          // Start the merge process and let user resolve manually
          return executeMergeWithConflictHandling(pane, context, mainBranch, mainRepoPath, 'manual');
        }

        if (optionId === 'ai_merge') {
          // Attempt AI-assisted merge
          return executeMergeWithConflictHandling(pane, context, mainBranch, mainRepoPath, 'ai');
        }

        return { type: 'info', message: 'Unknown option', dismissable: true };
      },
      dismissable: true,
    };
  }

  // Generic issue display
  return {
    type: 'error',
    title: 'Merge Issues Detected',
    message: issues.map((i: any) => i.message).join('\n'),
    dismissable: true,
  };
}

/**
 * Execute merge with conflict handling
 */
async function executeMergeWithConflictHandling(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string,
  strategy: 'manual' | 'ai'
): Promise<ActionResult> {
  const { mergeMainIntoWorktree, getConflictingFiles, completeMerge } = await import(
    '../utils/mergeExecution.js'
  );

  // Step 1: Merge main into worktree
  const result = mergeMainIntoWorktree(pane.worktreePath!, mainBranch);

  if (!result.success && result.needsManualResolution) {
    if (strategy === 'ai') {
      // Try AI resolution
      const { aiResolveAllConflicts } = await import('../utils/aiMerge.js');
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
 */
async function executeMerge(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string
): Promise<ActionResult> {
  const { mergeWorktreeIntoMain, cleanupAfterMerge } = await import('../utils/mergeExecution.js');

  // Step 2: Merge worktree into main
  const result = mergeWorktreeIntoMain(mainRepoPath, pane.slug);

  if (!result.success) {
    return {
      type: 'error',
      title: 'Merge Failed',
      message: `Failed to merge into ${mainBranch}: ${result.error}`,
      dismissable: true,
    };
  }

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

      // Close the pane
      return executeCloseOption(pane, context, 'kill_only');
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

/**
 * Rename a pane
 */
export async function renamePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  return {
    type: 'input',
    title: 'Rename Pane',
    message: 'Enter new name for pane:',
    placeholder: pane.slug,
    defaultValue: pane.slug,
    onSubmit: async (value: string) => {
      if (!value || value === pane.slug) {
        return {
          type: 'info',
          message: 'Rename cancelled',
          dismissable: true,
        };
      }

      // Update pane name
      const updatedPane: DmuxPane = {
        ...pane,
        slug: value,
      };

      // Update tmux pane title
      try {
        execSync(`tmux select-pane -t '${pane.paneId}' -T "${value}"`, { stdio: 'pipe' });
      } catch {
        // Ignore if title update fails
      }

      // Update in panes list
      const updatedPanes = context.panes.map(p => p.id === pane.id ? updatedPane : p);
      await context.savePanes(updatedPanes);

      if (context.onPaneUpdate) {
        context.onPaneUpdate(updatedPane);
      }

      return {
        type: 'success',
        message: `Renamed to "${value}"`,
        dismissable: true,
      };
    },
  };
}

/**
 * Copy worktree path to clipboard
 */
export async function copyPath(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  if (!pane.worktreePath) {
    return {
      type: 'error',
      message: 'This pane has no worktree path',
      dismissable: true,
    };
  }

  try {
    // Try to copy to clipboard (works on macOS)
    execSync(`echo "${pane.worktreePath}" | pbcopy`, { stdio: 'pipe' });

    return {
      type: 'success',
      message: `Path copied: ${pane.worktreePath}`,
      dismissable: true,
    };
  } catch {
    // If clipboard copy fails, just show the path
    return {
      type: 'info',
      message: `Path: ${pane.worktreePath}`,
      dismissable: true,
    };
  }
}

/**
 * Open worktree in external editor
 */
export async function openInEditor(
  pane: DmuxPane,
  context: ActionContext,
  params?: { editor?: string }
): Promise<ActionResult> {
  if (!pane.worktreePath) {
    return {
      type: 'error',
      message: 'This pane has no worktree to open',
      dismissable: true,
    };
  }

  const editor = params?.editor || process.env.EDITOR || 'code';

  try {
    execSync(`${editor} "${pane.worktreePath}"`, { stdio: 'pipe' });

    return {
      type: 'success',
      message: `Opened in ${editor}`,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to open in editor: ${error}`,
      dismissable: true,
    };
  }
}

/**
 * Duplicate a pane (create a new pane with the same prompt)
 */
export async function duplicatePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  return {
    type: 'confirm',
    title: 'Duplicate Pane',
    message: `Create a new pane with the same prompt as "${pane.slug}"?`,
    confirmLabel: 'Duplicate',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      // This would trigger the new pane creation flow with the same prompt
      return {
        type: 'info',
        message: 'Duplication not yet implemented',
        data: { action: 'create_pane', prompt: pane.prompt, agent: pane.agent },
        dismissable: true,
      };
    },
  };
}

/**
 * Toggle autopilot mode for a pane
 */
export async function toggleAutopilot(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  try {
    // Toggle the autopilot setting
    const newAutopilotState = !pane.autopilot;

    // Update the pane
    const updatedPanes = context.panes.map(p =>
      p.id === pane.id ? { ...p, autopilot: newAutopilotState } : p
    );

    // Save the updated panes
    await context.savePanes(updatedPanes);

    // Notify about the update
    if (context.onPaneUpdate) {
      context.onPaneUpdate({ ...pane, autopilot: newAutopilotState });
    }

    return {
      type: 'success',
      message: `Autopilot ${newAutopilotState ? 'enabled' : 'disabled'} for "${pane.slug}"`,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to toggle autopilot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      dismissable: true,
    };
  }
}
