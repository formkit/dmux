/**
 * RENAME Action - Rename a pane
 * NOTE: Renaming is disabled because pane names are tied to git worktree branches.
 * Renaming would require renaming the branch and moving the worktree directory,
 * which is complex and error-prone.
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';

/**
 * Rename a pane (currently disabled - shows info message)
 */
export async function renamePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  return {
    type: 'info',
    title: 'Rename Not Supported',
    message: 'Pane names are tied to git worktree branches and cannot be renamed after creation.\n\nThe pane name always matches the worktree directory and git branch name.',
    dismissable: true,
  };
}
