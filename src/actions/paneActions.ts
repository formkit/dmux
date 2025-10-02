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
 * Merge a worktree into the main branch
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

  const mainBranch = params?.mainBranch || 'main';

  return {
    type: 'confirm',
    title: 'Merge Worktree',
    message: `Merge "${pane.slug}" into ${mainBranch}?`,
    confirmLabel: 'Merge',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      return executeMerge(pane, context, mainBranch);
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
 * Execute the merge operation
 */
async function executeMerge(
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string
): Promise<ActionResult> {
  if (!pane.worktreePath) {
    return {
      type: 'error',
      message: 'No worktree to merge',
      dismissable: true,
    };
  }

  try {
    const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

    // Check for uncommitted changes
    let hasChanges = false;
    try {
      const status = execSync('git status --porcelain', {
        cwd: pane.worktreePath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      hasChanges = status.trim().length > 0;
    } catch {
      // Ignore errors
    }

    // If there are changes, commit them first
    if (hasChanges) {
      // Generate a simple commit message based on branch name
      const commitMessage = `feat: changes from ${pane.slug}`;

      try {
        execSync('git add -A', {
          cwd: pane.worktreePath,
          stdio: 'pipe',
        });

        execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
          cwd: pane.worktreePath,
          stdio: 'pipe',
        });
      } catch (error) {
        return {
          type: 'error',
          message: `Failed to commit changes: ${error}`,
          dismissable: true,
        };
      }
    }

    // Switch to main branch and merge
    try {
      execSync(`git checkout ${mainBranch}`, {
        cwd: mainRepoPath,
        stdio: 'pipe',
      });

      execSync(`git merge ${pane.slug} --no-edit`, {
        cwd: mainRepoPath,
        stdio: 'pipe',
      });
    } catch (error) {
      return {
        type: 'error',
        message: `Merge failed: ${error}. You may need to resolve conflicts manually.`,
        dismissable: true,
      };
    }

    // Ask if user wants to close the pane
    return {
      type: 'confirm',
      title: 'Merge Complete',
      message: `Successfully merged "${pane.slug}" into ${mainBranch}. Close the pane?`,
      confirmLabel: 'Yes, close it',
      cancelLabel: 'No, keep it',
      onConfirm: async () => {
        return executeCloseOption(pane, context, 'kill_clean_branch');
      },
      onCancel: async () => {
        return {
          type: 'success',
          message: 'Merge complete. Pane kept open.',
          dismissable: true,
        };
      },
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Merge operation failed: ${error}`,
      dismissable: true,
    };
  }
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
