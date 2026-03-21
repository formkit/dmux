/**
 * VIEW Action - Jump to/view a pane
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { getPaneDisplayName } from '../../utils/paneTitle.js';

/**
 * View/Jump to a pane
 */
export async function viewPane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  const paneName = getPaneDisplayName(pane);

  if (pane.hidden) {
    return {
      type: 'info',
      message: `Pane "${paneName}" is hidden. Press h to show it.`,
      dismissable: true,
    };
  }

  try {
    execSync(`tmux select-pane -t '${pane.paneId}'`, { stdio: 'pipe' });

    return {
      type: 'navigation',
      message: `Jumped to pane: ${paneName}`,
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
