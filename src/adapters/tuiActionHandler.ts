/**
 * TUI Action Handler
 *
 * Adapts standardized ActionResults to the terminal UI.
 * Manages state for dialogs, confirmations, and user input.
 */

import type { ActionResult } from '../actions/types.js';

/**
 * TUI State that needs to be updated based on action results
 */
export interface TUIActionState {
  // Dialog states
  showConfirmDialog: boolean;
  confirmTitle: string;
  confirmMessage: string;
  confirmYesLabel: string;
  confirmNoLabel: string;
  confirmSelectedIndex: number;
  onConfirmYes: (() => Promise<ActionResult>) | null;
  onConfirmNo: (() => Promise<ActionResult>) | null;

  showChoiceDialog: boolean;
  choiceTitle: string;
  choiceMessage: string;
  choiceOptions: Array<{ id: string; label: string; description?: string; danger?: boolean }>;
  choiceSelectedIndex: number;
  onChoiceSelect: ((optionId: string) => Promise<ActionResult>) | null;

  showInputDialog: boolean;
  inputTitle: string;
  inputMessage: string;
  inputPlaceholder: string;
  inputDefaultValue: string;
  inputValue: string;
  onInputSubmit: ((value: string) => Promise<ActionResult>) | null;

  showProgressDialog: boolean;
  progressMessage: string;
  progressPercent?: number;

  // Status message
  statusMessage: string;
  statusType: 'info' | 'success' | 'error';

  // Navigation
  targetPaneId: string | null;
}

/**
 * Initial state for TUI
 */
export function createInitialTUIState(): TUIActionState {
  return {
    showConfirmDialog: false,
    confirmTitle: '',
    confirmMessage: '',
    confirmYesLabel: 'Yes',
    confirmNoLabel: 'No',
    confirmSelectedIndex: 0,
    onConfirmYes: null,
    onConfirmNo: null,

    showChoiceDialog: false,
    choiceTitle: '',
    choiceMessage: '',
    choiceOptions: [],
    choiceSelectedIndex: 0,
    onChoiceSelect: null,

    showInputDialog: false,
    inputTitle: '',
    inputMessage: '',
    inputPlaceholder: '',
    inputDefaultValue: '',
    inputValue: '',
    onInputSubmit: null,

    showProgressDialog: false,
    progressMessage: '',
    progressPercent: undefined,

    statusMessage: '',
    statusType: 'info',

    targetPaneId: null,
  };
}

/**
 * Handle an ActionResult and update TUI state accordingly
 */
export function handleActionResult(
  result: ActionResult,
  currentState: TUIActionState,
  setState: (updates: Partial<TUIActionState>) => void
): void {
  // Reset previous dialogs
  const resetState: Partial<TUIActionState> = {
    showConfirmDialog: false,
    showChoiceDialog: false,
    showInputDialog: false,
    showProgressDialog: false,
    targetPaneId: null,
  };

  // Two-phase update: first clear all dialogs, then show new one
  // This prevents visual artifacts when transitioning between dialogs
  if (currentState.showConfirmDialog || currentState.showChoiceDialog ||
      currentState.showInputDialog || currentState.showProgressDialog) {
    // First clear all dialogs
    setState(resetState);

    // Then schedule the new state after a brief delay to allow Ink to re-render
    setTimeout(() => {
      applyNewDialogState(result, resetState, setState);
    }, 50);
  } else {
    // No active dialog, apply immediately
    applyNewDialogState(result, resetState, setState);
  }
}

/**
 * Apply the new dialog state
 */
function applyNewDialogState(
  result: ActionResult,
  resetState: Partial<TUIActionState>,
  setState: (updates: Partial<TUIActionState>) => void
): void {
  switch (result.type) {
    case 'success':
    case 'error':
    case 'info':
      setState({
        ...resetState,
        statusMessage: result.message,
        statusType: result.type === 'error' ? 'error' : result.type === 'success' ? 'success' : 'info',
      });
      break;

    case 'confirm':
      setState({
        ...resetState,
        showConfirmDialog: true,
        confirmTitle: result.title || 'Confirm',
        confirmMessage: result.message,
        confirmYesLabel: result.confirmLabel || 'Yes',
        confirmNoLabel: result.cancelLabel || 'No',
        confirmSelectedIndex: 0,
        onConfirmYes: result.onConfirm || null,
        onConfirmNo: result.onCancel || null,
      });
      break;

    case 'choice':
      setState({
        ...resetState,
        showChoiceDialog: true,
        choiceTitle: result.title || 'Select Option',
        choiceMessage: result.message,
        choiceOptions: result.options || [],
        choiceSelectedIndex: 0,
        onChoiceSelect: result.onSelect || null,
      });
      break;

    case 'input':
      setState({
        ...resetState,
        showInputDialog: true,
        inputTitle: result.title || 'Input',
        inputMessage: result.message,
        inputPlaceholder: result.placeholder || '',
        inputDefaultValue: result.defaultValue || '',
        inputValue: result.defaultValue || '',
        onInputSubmit: result.onSubmit || null,
      });
      break;

    case 'progress':
      setState({
        ...resetState,
        showProgressDialog: true,
        progressMessage: result.message,
        progressPercent: result.progress,
      });
      break;

    case 'navigation':
      setState({
        ...resetState,
        targetPaneId: result.targetPaneId || null,
        statusMessage: result.message,
        statusType: 'info',
      });
      break;
  }
}

/**
 * Clear all dialogs and reset state
 */
export function clearAllDialogs(
  setState: (updates: Partial<TUIActionState>) => void
): void {
  setState({
    showConfirmDialog: false,
    showChoiceDialog: false,
    showInputDialog: false,
    showProgressDialog: false,
    onConfirmYes: null,
    onConfirmNo: null,
    onChoiceSelect: null,
    onInputSubmit: null,
  });
}
