/**
 * COPY_PATH Action - Copy worktree path to clipboard
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';

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
