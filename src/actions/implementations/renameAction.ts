/**
 * RENAME Action - Rename a pane
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';

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
