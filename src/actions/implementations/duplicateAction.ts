/**
 * DUPLICATE Action - Duplicate a pane with the same prompt
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';

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
