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
  onActionResult?: (result: ActionResult) => Promise<void>;

  // Popup launchers (optional - falls back to inline dialogs if not provided)
  popupLaunchers?: {
    launchConfirmPopup?: (title: string, message: string, yesLabel?: string, noLabel?: string) => Promise<boolean>;
    launchChoicePopup?: (title: string, message: string, options: Array<{id: string, label: string, description?: string, danger?: boolean, default?: boolean}>) => Promise<string | null>;
    launchInputPopup?: (title: string, message: string, placeholder?: string, defaultValue?: string) => Promise<string | null>;
    launchProgressPopup?: (message: string, type: 'info' | 'success' | 'error', timeout: number) => Promise<void>;
  };
}

/**
 * Recursively handles action results with popup interactions
 * Extracted to top-level to avoid nested function complexity
 *
 * @param result - The action result to handle
 * @param popupLaunchers - Available popup launchers
 */
async function handleResultWithPopups(
  result: ActionResult,
  popupLaunchers: UseActionSystemParams['popupLaunchers']
): Promise<void> {
  // Handle confirm dialogs
  if (result.type === 'confirm' && popupLaunchers?.launchConfirmPopup) {
    const confirmed = await popupLaunchers.launchConfirmPopup(
      result.title || 'Confirm',
      result.message,
      result.confirmLabel,
      result.cancelLabel
    );

    if (confirmed && result.onConfirm) {
      const nextResult = await result.onConfirm();
      await handleResultWithPopups(nextResult, popupLaunchers);
    } else if (!confirmed && result.onCancel) {
      const nextResult = await result.onCancel();
      await handleResultWithPopups(nextResult, popupLaunchers);
    }
    return;
  }

  // Handle choice dialogs
  if (result.type === 'choice' && popupLaunchers?.launchChoicePopup) {
    const selectedId = await popupLaunchers.launchChoicePopup(
      result.title || 'Choose',
      result.message,
      result.options || []
    );

    if (selectedId && result.onSelect) {
      const nextResult = await result.onSelect(selectedId);
      await handleResultWithPopups(nextResult, popupLaunchers);
    }
    return;
  }

  // Handle input dialogs
  if (result.type === 'input' && popupLaunchers?.launchInputPopup) {
    const inputValue = await popupLaunchers.launchInputPopup(
      result.title || 'Input',
      result.message,
      result.placeholder,
      result.defaultValue
    );

    if (inputValue !== null && result.onSubmit) {
      const nextResult = await result.onSubmit(inputValue);
      await handleResultWithPopups(nextResult, popupLaunchers);
    }
    return;
  }

  // Handle non-interactive results (success, error, info, etc.)
  // Use toast notification for better UX
  const { default: stateManager } = await import('../shared/StateManager.js');
  const type = result.type === 'error' ? 'error' : result.type === 'success' ? 'success' : 'info';
  stateManager.showToast(result.message, type);
}

export default function useActionSystem({
  panes,
  savePanes,
  sessionName,
  projectName,
  onPaneUpdate,
  onPaneRemove,
  onActionResult,
  popupLaunchers,
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
    onActionResult,
  }), [panes, sessionName, projectName, savePanes, onPaneUpdate, onPaneRemove, onActionResult]);

  // Execute an action and handle the result
  const executeActionWithHandling = useCallback(async (
    actionId: PaneAction,
    pane: DmuxPane,
    params?: any
  ) => {
    try {
      const result = await executeAction(actionId, pane, context, params);

      // If popup launchers are available, handle interactive results with popups
      if (popupLaunchers) {
        await handleResultWithPopups(result, popupLaunchers);
      } else {
        // Fall back to inline dialogs if popup launchers not available
        handleActionResult(result, actionState, (updates) => {
          setActionState(prev => ({ ...prev, ...updates }));
        });
      }
    } catch (error) {
      // Handle execution errors
      setActionState(prev => ({
        ...prev,
        statusMessage: `Action failed: ${error}`,
        statusType: 'error',
      }));
    }
  }, [context, actionState, popupLaunchers]);

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

      // Hide progress
      if (showProgress) {
        setActionState(prev => ({
          ...prev,
          showProgressDialog: false,
        }));
      }

      // Handle the result (may trigger more dialogs)
      if (popupLaunchers) {
        await handleResultWithPopups(result, popupLaunchers);
      } else {
        handleActionResult(result, actionState, (updates) => {
          setActionState(prev => ({ ...prev, ...updates }));
        });
      }
    } catch (error) {
      // Hide progress and show error
      setActionState(prev => ({
        ...prev,
        showProgressDialog: false,
        statusMessage: `Operation failed: ${error}`,
        statusType: 'error',
      }));
    }
  }, [context, actionState, popupLaunchers]);

  // Clear a specific dialog
  const clearDialog = useCallback((dialogType: keyof TUIActionState) => {
    setActionState(prev => ({
      ...prev,
      [dialogType]: false,
    }));
  }, []);

  // Clear status message
  const clearStatus = useCallback(() => {
    setActionState(prev => ({
      ...prev,
      statusMessage: '',
    }));
  }, []);

  return {
    actionState,
    executeAction: executeActionWithHandling,
    executeCallback,
    clearDialog,
    clearStatus,
    setActionState,
  };
}
