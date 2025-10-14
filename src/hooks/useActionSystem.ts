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
  forceRepaint?: () => void;

  // Popup launchers (optional - falls back to inline dialogs if not provided)
  popupLaunchers?: {
    launchConfirmPopup?: (title: string, message: string, yesLabel?: string, noLabel?: string) => Promise<boolean>;
    launchChoicePopup?: (title: string, message: string, options: Array<{id: string, label: string, description?: string, danger?: boolean, default?: boolean}>) => Promise<string | null>;
    launchInputPopup?: (title: string, message: string, placeholder?: string, defaultValue?: string) => Promise<string | null>;
    launchProgressPopup?: (message: string, type: 'info' | 'success' | 'error', timeout: number) => Promise<void>;
  };
}

export default function useActionSystem({
  panes,
  savePanes,
  sessionName,
  projectName,
  onPaneUpdate,
  onPaneRemove,
  forceRepaint,
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
    forceRepaint,
  }), [panes, sessionName, projectName, savePanes, onPaneUpdate, onPaneRemove, forceRepaint]);

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
        if (result.type === 'confirm' && popupLaunchers.launchConfirmPopup) {
          const confirmed = await popupLaunchers.launchConfirmPopup(
            result.title || 'Confirm',
            result.message,
            result.confirmLabel,
            result.cancelLabel
          );

          if (confirmed && result.onConfirm) {
            const nextResult = await result.onConfirm();
            // Recursively handle the next result
            await handleResultWithPopups(nextResult);
          } else if (!confirmed && result.onCancel) {
            const nextResult = await result.onCancel();
            await handleResultWithPopups(nextResult);
          }
          return;
        }

        if (result.type === 'choice' && popupLaunchers.launchChoicePopup) {
          const selectedId = await popupLaunchers.launchChoicePopup(
            result.title || 'Choose',
            result.message,
            result.options || []
          );

          if (selectedId && result.onSelect) {
            const nextResult = await result.onSelect(selectedId);
            await handleResultWithPopups(nextResult);
          }
          return;
        }

        if (result.type === 'input' && popupLaunchers.launchInputPopup) {
          const inputValue = await popupLaunchers.launchInputPopup(
            result.title || 'Input',
            result.message,
            result.placeholder,
            result.defaultValue
          );

          if (inputValue !== null && result.onSubmit) {
            const nextResult = await result.onSubmit(inputValue);
            await handleResultWithPopups(nextResult);
          }
          return;
        }
      }

      // Fall back to inline dialogs if popup launchers not available
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

    // Helper to recursively handle action results with popups
    async function handleResultWithPopups(result: ActionResult): Promise<void> {
      if (result.type === 'confirm' && popupLaunchers?.launchConfirmPopup) {
        const confirmed = await popupLaunchers.launchConfirmPopup(
          result.title || 'Confirm',
          result.message,
          result.confirmLabel,
          result.cancelLabel
        );

        if (confirmed && result.onConfirm) {
          const nextResult = await result.onConfirm();
          await handleResultWithPopups(nextResult);
        } else if (!confirmed && result.onCancel) {
          const nextResult = await result.onCancel();
          await handleResultWithPopups(nextResult);
        }
      } else if (result.type === 'choice' && popupLaunchers?.launchChoicePopup) {
        const selectedId = await popupLaunchers.launchChoicePopup(
          result.title || 'Choose',
          result.message,
          result.options || []
        );

        if (selectedId && result.onSelect) {
          const nextResult = await result.onSelect(selectedId);
          await handleResultWithPopups(nextResult);
        }
      } else if (result.type === 'input' && popupLaunchers?.launchInputPopup) {
        const inputValue = await popupLaunchers.launchInputPopup(
          result.title || 'Input',
          result.message,
          result.placeholder,
          result.defaultValue
        );

        if (inputValue !== null && result.onSubmit) {
          const nextResult = await result.onSubmit(inputValue);
          await handleResultWithPopups(nextResult);
        }
      } else {
        // For non-interactive results (success, error, info, etc.)
        // Use progress popup if available, otherwise fall back to inline status message
        if (popupLaunchers?.launchProgressPopup) {
          const type = result.type === 'error' ? 'error' : result.type === 'success' ? 'success' : 'info';
          await popupLaunchers.launchProgressPopup(result.message, type, 1000);

          // Force repaint after popup dismisses (with a slight delay to avoid layout issues)
          if (context.forceRepaint) {
            setTimeout(() => {
              context.forceRepaint!();
            }, 300);
          }
        } else {
          setActionState(prev => ({
            ...prev,
            statusMessage: result.message,
            statusType: result.type === 'error' ? 'error' : result.type === 'success' ? 'success' : 'info',
          }));

          // Auto-clear after 3 seconds
          setTimeout(() => {
            setActionState(prev => ({
              ...prev,
              statusMessage: '',
            }));
          }, 3000);
        }
      }
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
