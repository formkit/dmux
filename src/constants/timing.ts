/**
 * Timing constants for delays and intervals throughout the application.
 * Centralized here for easier tuning and documentation.
 */

// UI-related timing
export const REPAINT_SPINNER_DURATION = 100; // Show spinner briefly to force re-render
export const LAYOUT_SETTLE_TIME = 100; // Wait for tmux to apply layout changes before continuing
export const STATUS_MESSAGE_DURATION_SHORT = 2000; // Show status messages for 2 seconds
export const STATUS_MESSAGE_DURATION_LONG = 3000; // Show important status messages for 3 seconds
export const TUNNEL_COPY_FEEDBACK_DURATION = 2000; // Show "Copied!" message for 2 seconds
export const ANIMATION_DELAY = 300; // General animation delay for UI transitions
export const INPUT_IGNORE_DELAY = 100; // Brief delay to prevent input race conditions

// Tmux operation delays
export const TMUX_PANE_CREATION_DELAY = 50; // Wait for pane to be fully registered in tmux
export const TMUX_SIDEBAR_SETTLE_DELAY = 100; // Wait for sidebar resize to complete
export const TMUX_SPLIT_DELAY = 100; // Wait after splitting pane for tmux to stabilize (ms)
export const TMUX_COMMAND_TIMEOUT = 1000; // Timeout for tmux command execution (ms)
export const TMUX_RETRY_DELAY = 100; // Delay between tmux command retries
export const TMUX_LAYOUT_APPLY_DELAY = 1000; // Wait for layout to fully apply before continuing

// Polling intervals
export const PANE_POLLING_INTERVAL = 5000; // Check for new/removed panes every 5 seconds

// Worker and service timing
export const TUNNEL_RETRY_DELAY = 1000; // Delay before retrying tunnel connection (ms)
export const WORKER_BACKOFF_BASE = 1000; // Base delay for worker restart backoff (ms, multiplied by retry count)
export const ASCII_ART_RENDER_DELAY = 100; // Delay for ASCII art rendering
