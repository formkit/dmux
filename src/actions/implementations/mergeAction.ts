/**
 * MERGE Action - Merge a worktree into the main branch with comprehensive pre-checks
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { StateManager } from '../../shared/StateManager.js';
import { triggerHook } from '../../utils/hooks.js';
import { LogService } from '../../services/LogService.js';

/**
 * Generate commit message with timeout and error handling
 * Returns null if it fails, so caller can fall back to manual input
 */
async function generateCommitMessageSafe(
  repoPath: string,
  timeoutMs: number = 15000
): Promise<string | null> {
  try {
    const { generateCommitMessage } = await import('../../utils/aiMerge.js');

    // Race between generation and timeout
    const result = await Promise.race([
      generateCommitMessage(repoPath),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    if (!result) {
      StateManager.getInstance().setDebugMessage('[AI] Commit message generation returned null');
      LogService.getInstance().warn('AI commit message generation returned null', 'aiMerge');
    }

    return result;
  } catch (error) {
    const errorMsg = `AI commit message generation error: ${error}`;
    StateManager.getInstance().setDebugMessage(`[AI] ${errorMsg}`);
    LogService.getInstance().error(errorMsg, 'aiMerge', undefined, error instanceof Error ? error : undefined);
    return null;
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
  const { validateMerge } = await import('../../utils/mergeValidation.js');
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
 * Handle detected merge issues
 */
async function handleMergeIssues(
  pane: DmuxPane,
  context: ActionContext,
  validation: any,
  mainRepoPath: string
): Promise<ActionResult> {
  const { issues, mainBranch } = validation;
  const { commitChanges, stashChanges } = await import('../../utils/mergeValidation.js');

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
          id: 'commit_automatic',
          label: 'AI commit (automatic)',
          description: 'Auto-generate and commit immediately',
          default: true,
        },
        {
          id: 'commit_ai_editable',
          label: 'AI commit (editable)',
          description: 'Generate message from diff, edit before commit',
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
            const { stageAllChanges } = await import('../../utils/mergeValidation.js');
            const { getComprehensiveDiff } = await import('../../utils/aiMerge.js');

            // Stage all changes first
            const stageResult = stageAllChanges(mainRepoPath);
            if (!stageResult.success) {
              return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
            }

            // Get diff and generate message
            const { diff, summary } = getComprehensiveDiff(mainRepoPath);
            StateManager.getInstance().setDebugMessage('[AI] Generating commit message for main repo...');
            const generatedMessage = await generateCommitMessageSafe(mainRepoPath);
            if (generatedMessage) {
              StateManager.getInstance().setDebugMessage(`[AI] Generated message: ${generatedMessage.split('\n')[0]}`);
            }

            // If AI generation failed, fall back to manual with explanation
            if (!generatedMessage) {
              StateManager.getInstance().setDebugMessage('[AI] Generation failed, falling back to manual input');
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
            StateManager.getInstance().setDebugMessage(`[AI] Unexpected error: ${error}`);
            return {
              type: 'error',
              message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              dismissable: true,
            };
          }
        }

        if (optionId === 'commit_automatic') {
          const { stageAllChanges } = await import('../../utils/mergeValidation.js');
          const { getComprehensiveDiff } = await import('../../utils/aiMerge.js');

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
          const { stageAllChanges } = await import('../../utils/mergeValidation.js');

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
          id: 'commit_automatic',
          label: 'AI commit (automatic)',
          description: 'Auto-generate and commit immediately',
          default: true,
        },
        {
          id: 'commit_ai_editable',
          label: 'AI commit (editable)',
          description: 'Generate message from diff, edit before commit',
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
            const { stageAllChanges } = await import('../../utils/mergeValidation.js');
            const { getComprehensiveDiff } = await import('../../utils/aiMerge.js');

            // Stage all changes first
            const stageResult = stageAllChanges(pane.worktreePath!);
            if (!stageResult.success) {
              return { type: 'error', message: `Failed to stage changes: ${stageResult.error}`, dismissable: true };
            }

            // Get diff and generate message
            const { diff, summary } = getComprehensiveDiff(pane.worktreePath!);
            StateManager.getInstance().setDebugMessage('[AI] Generating commit message for worktree...');
            const generatedMessage = await generateCommitMessageSafe(pane.worktreePath!);
            if (generatedMessage) {
              StateManager.getInstance().setDebugMessage(`[AI] Generated message: ${generatedMessage.split('\n')[0]}`);
            }

            // If AI generation failed, fall back to manual with explanation
            if (!generatedMessage) {
              StateManager.getInstance().setDebugMessage('[AI] Generation failed, falling back to manual input');
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
            StateManager.getInstance().setDebugMessage(`[AI] Unexpected error: ${error}`);
            return {
              type: 'error',
              message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
              dismissable: true,
            };
          }
        }

        if (optionId === 'commit_automatic') {
          const { stageAllChanges } = await import('../../utils/mergeValidation.js');
          const { getComprehensiveDiff } = await import('../../utils/aiMerge.js');

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
          const { stageAllChanges } = await import('../../utils/mergeValidation.js');

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
          // Attempt AI-assisted merge via new pane
          return createConflictResolutionPaneForMerge(pane, context, mainBranch, mainRepoPath);
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
 * Create a new pane for AI-assisted conflict resolution
 */
async function createConflictResolutionPaneForMerge(
  pane: DmuxPane,
  context: ActionContext,
  targetBranch: string,
  targetRepoPath: string
): Promise<ActionResult> {
  // First, check which agents are available
  const { findClaudeCommand, findOpencodeCommand } = await import('../../utils/agentDetection.js');

  const availableAgents: Array<'claude' | 'opencode'> = [];
  if (await findClaudeCommand()) availableAgents.push('claude');
  if (await findOpencodeCommand()) availableAgents.push('opencode');

  if (availableAgents.length === 0) {
    return {
      type: 'error',
      message: 'No AI agents available. Please install claude or opencode.',
      dismissable: true,
    };
  }

  // If multiple agents available, ask user to choose
  if (availableAgents.length > 1) {
    return {
      type: 'choice',
      title: 'Choose AI Agent for Conflict Resolution',
      message: 'Which agent would you like to use to resolve merge conflicts?',
      options: availableAgents.map(agent => ({
        id: agent,
        label: agent === 'claude' ? 'Claude Code' : 'OpenCode',
        description: agent === 'claude' ? 'Anthropic Claude' : 'Open-source alternative',
        default: agent === 'claude',
      })),
      onSelect: async (agentId: string) => {
        return createAndLaunchConflictPane(
          pane,
          context,
          targetBranch,
          targetRepoPath,
          agentId as 'claude' | 'opencode'
        );
      },
      dismissable: true,
    };
  }

  // Only one agent available, use it directly
  return createAndLaunchConflictPane(
    pane,
    context,
    targetBranch,
    targetRepoPath,
    availableAgents[0]
  );
}

/**
 * Actually create and launch the conflict resolution pane
 */
async function createAndLaunchConflictPane(
  pane: DmuxPane,
  context: ActionContext,
  targetBranch: string,
  targetRepoPath: string,
  agent: 'claude' | 'opencode'
): Promise<ActionResult> {
  try {
    const { createConflictResolutionPane } = await import('../../utils/conflictResolutionPane.js');

    // Create the new pane
    const conflictPane = await createConflictResolutionPane({
      sourceBranch: pane.slug,
      targetBranch,
      targetRepoPath,
      agent,
      projectName: context.projectName,
      existingPanes: context.panes,
    });

    // Add the new pane to the panes list
    const updatedPanes = [...context.panes, conflictPane];
    await context.savePanes(updatedPanes);

    // Notify about the new pane
    if (context.onPaneUpdate) {
      context.onPaneUpdate(conflictPane);
    }

    return {
      type: 'navigation',
      title: 'Conflict Resolution Pane Created',
      message: `Created pane "${conflictPane.slug}" with ${agent} to help resolve conflicts. Switch to it to see the AI working.`,
      targetPaneId: conflictPane.id,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to create conflict resolution pane: ${error instanceof Error ? error.message : String(error)}`,
      dismissable: true,
    };
  }
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
    '../../utils/mergeExecution.js'
  );

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
 */
async function executeMerge(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  mainRepoPath: string
): Promise<ActionResult> {
  const { mergeWorktreeIntoMain, cleanupAfterMerge } = await import('../../utils/mergeExecution.js');

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

      // Import the closePane function from closeAction
      const { closePane: executeCloseOption } = await import('./closeAction.js');

      // Close the pane by calling closePane and selecting 'kill_only' option
      // We need to execute the close directly since we're in the cleanup phase
      const closeResult = await executeCloseOption(pane, context);

      // If closeResult is a choice dialog, automatically select 'kill_only'
      if (closeResult.type === 'choice' && closeResult.onSelect) {
        return closeResult.onSelect('kill_only');
      }

      return closeResult;
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
