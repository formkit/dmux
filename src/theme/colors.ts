/**
 * Global color theme for dmux
 * These colors are used consistently across the TUI
 */

// ANSI 256-color code 208 - matches the decorative welcome pane
export const DMUX_ORANGE = '#ff8700';

// Lighter orange for tmux borders (ANSI 256-color code 214)
export const DMUX_ORANGE_LIGHT = '#ffaf00';

export const COLORS = {
  // Primary accent color (orange from welcome pane)
  accent: DMUX_ORANGE,

  // UI colors
  selected: DMUX_ORANGE,
  unselected: 'white',
  border: 'gray',
  borderSelected: DMUX_ORANGE,

  // Status colors
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'cyan',

  // Agent status colors
  working: 'cyan',
  analyzing: 'magenta',
  waiting: 'yellow',
} as const;

// Tmux-specific colors (for use in tmux commands)
export const TMUX_COLORS = {
  activeBorder: '214',  // Light orange (ANSI 256-color)
  inactiveBorder: '240', // Gray (ANSI 256-color)
  background: '234',    // Warm dark gray background (ANSI 256-color)
  activeBackground: '235', // Slightly lighter for active pane (ANSI 256-color)
  popupBackground: '232', // Even darker gray for popups/dialogs (ANSI 256-color)
} as const;
