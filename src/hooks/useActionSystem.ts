/**
 * Hook for using the standardized action system in the TUI
 *
 * This hook provides a bridge between the pure action functions
 * and the React state management of the TUI.
 */

import { useState, useCallback, useMemo } from 'react';
import { executeAction, PaneAction, type ActionContext } from '../actions/index.js';
import type { ActionResult } from '../actions/types.js';
import {
  handleActionResult,
  createInitialTUIState,
  type TUIActionState
} from '../adapters/tuiActionHandler.js';
import type { DmuxPane } from '../types.js';

interface UseActionSystemParams {
  panes: DmuxPane[];
  savePanes: (panes: DmuxPane[]) => Promise<void>;
  sessionName: string;
  projectName: string;
  onPaneUpdate?: (pane: DmuxPane) => void;
  onPaneRemove?: (paneId: string) => void;
}

export default function useActionSystem({
  panes,
  savePanes,
  sessionName,
  projectName,
  onPaneUpdate,
  onPaneRemove,
}: UseActionSystemParams) {
  // TUI state for rendering dialogs
  const [actionState, setActionState] = useState<TUIActionState>(createInitialTUIState());

  // Create action context
  const context: ActionContext = useMemo(() => ({
    panes,
    sessionName,
    projectName,
    savePanes,
    onPaneUpdate,
    onPaneRemove,
  }), [panes, sessionName, projectName, savePanes, onPaneUpdate, onPaneRemove]);

  // Execute an action and handle the result
  const executeActionWithHandling = useCallback(async (
    actionId: PaneAction,
    pane: DmuxPane,
    params?: any
  ) => {
    try {
      const result = await executeAction(actionId, pane, context, params);

      // Convert result to TUI state updates
      handleActionResult(result, actionState, (updates) => {
        setActionState(prev => ({ ...prev, ...updates }));
      });
    } catch (error) {
      // Handle execution errors
      setActionState(prev => ({
        ...prev,
        statusMessage: `Action failed: ${error}`,
        statusType: 'error',
      }));
    }
  }, [context, actionState]);

  // Handle callback execution (for multi-step actions)
  const executeCallback = useCallback(async (
    callback: (() => Promise<ActionResult>) | null,
    options?: { showProgress?: boolean; progressMessage?: string }
  ) => {
    if (!callback) return;

    const showProgress = options?.showProgress !== false; // default true
    const progressMessage = options?.progressMessage || 'Processing...';

    try {
      // Show progress indicator while executing
      if (showProgress) {
        setActionState(prev => ({
          ...prev,
          showProgressDialog: true,
          progressMessage,
          progressPercent: undefined,
        }));
      }

      const result = await callback();
      handleActionResult(result, actionState, (updates) => {
        setActionState(prev => ({ ...prev, ...updates }));
      });
    } catch (error) {
      setActionState(prev => ({
        ...prev,
        showProgressDialog: false,
        statusMessage: `Action failed: ${error}`,
        statusType: 'error',
      }));
    }
  }, [actionState]);

  // Clear status message after timeout
  const clearStatusMessage = useCallback((timeout = 3000) => {
    setTimeout(() => {
      setActionState(prev => ({
        ...prev,
        statusMessage: '',
      }));
    }, timeout);
  }, []);

  return {
    // State for rendering
    actionState,
    setActionState,

    // Execute actions
    executeAction: executeActionWithHandling,
    executeCallback,

    // Utilities
    clearStatusMessage,

    // Check if any dialog is open
    isDialogOpen: actionState.showConfirmDialog ||
                  actionState.showChoiceDialog ||
                  actionState.showInputDialog ||
                  actionState.showProgressDialog,
  };
}
