import { COLORS, TMUX_COLORS } from '../../theme/colors.js';

/**
 * Centralized configuration for all dmux popups
 * Single source of truth for popup styling and behavior
 */
export const POPUP_CONFIG = {
  // Visual theme
  borderStyle: 'round' as const,
  borderColor: COLORS.accent,          // Orange border for main containers
  inputBorderStyle: 'bold' as const,
  inputBorderColor: COLORS.accent,     // Orange border for input boxes
  titleColor: COLORS.accent,           // Orange titles
  successColor: COLORS.success,        // Green for success states
  errorColor: COLORS.error,            // Red for error states
  dimColor: 'gray' as const,           // Gray for hints/secondary text

  // Tmux popup styling (used in popup.ts) - foreground only
  tmuxBorderColor: TMUX_COLORS.activeBorder,    // colour214

  // Default dimensions
  defaultWidth: 60,
  defaultHeight: 20,
  largeWidth: 90,
  smallWidth: 50,

  // Padding/spacing
  containerPadding: { x: 2, y: 1 },
  inputPadding: { x: 1, y: 0 },
  sectionSpacing: 1,

  // Footer hints
  cancelHint: 'ESC to cancel',
  submitHint: 'Enter to submit',
  navigationHint: '↑↓ to navigate • Enter to select',
} as const;

/**
 * Standard footer text for popups
 */
export const PopupFooters = {
  input: () => `${POPUP_CONFIG.submitHint} • ${POPUP_CONFIG.cancelHint}`,

  choice: () => `${POPUP_CONFIG.navigationHint} • ${POPUP_CONFIG.cancelHint}`,

  confirm: (yesKey = 'y', noKey = 'n') =>
    `[${yesKey}]es / [${noKey}]o • ${POPUP_CONFIG.cancelHint}`,
};
