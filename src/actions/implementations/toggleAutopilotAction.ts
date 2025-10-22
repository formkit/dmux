/**
 * TOGGLE_AUTOPILOT Action - Toggle autopilot mode for a pane
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';

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
