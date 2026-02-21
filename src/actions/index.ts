/**
 * Standardized Action System - Main Entry Point
 *
 * This module exports all action types, implementations, and utilities.
 * Import from here to use the action system in any interface.
 */

export * from './types.js';
export * as paneActions from './paneActions.js';

import type { DmuxPane } from '../types.js';
import type { ActionResult, ActionContext, PaneAction } from './types.js';
import * as actions from './paneActions.js';

/**
 * Action dispatcher - executes an action by name
 */
export async function executeAction(
  actionId: PaneAction,
  pane: DmuxPane,
  context: ActionContext,
  params?: any
): Promise<ActionResult> {
  switch (actionId) {
    case 'view':
      return actions.viewPane(pane, context);

    case 'close':
      return actions.closePane(pane, context);

    case 'merge':
      return actions.mergePane(pane, context, params);

    case 'rename':
      return actions.renamePane(pane, context);

    case 'duplicate':
      return actions.duplicatePane(pane, context);

    case 'copy_path':
      return actions.copyPath(pane, context);

    case 'open_in_editor':
      return actions.openInEditor(pane, context, params);

    case 'toggle_autopilot':
      return actions.toggleAutopilot(pane, context);

    case 'open_pr':
      return actions.openPr(pane, context);

    case 'run_test':
    case 'run_dev':
    case 'open_output':
      // These would be implemented based on existing runCommand logic
      return {
        type: 'info',
        message: `Action ${actionId} not yet migrated to new system`,
        dismissable: true,
      };

    default:
      return {
        type: 'error',
        message: `Unknown action: ${actionId}`,
        dismissable: true,
      };
  }
}

/**
 * Convenience function to get an action handler
 */
export function getActionHandler(actionId: PaneAction) {
  return (pane: DmuxPane, context: ActionContext, params?: any) =>
    executeAction(actionId, pane, context, params);
}
