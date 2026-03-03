/**
 * VIEW Action - Jump to/view a pane
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { WindowManager } from '../../services/WindowManager.js';

/**
 * View/Jump to a pane
 */
export async function viewPane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  try {
    // Switch to the correct window first if pane is in a different one
    if (pane.windowId) {
      await WindowManager.getInstance().switchToWindowForPane(pane);
    }

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
