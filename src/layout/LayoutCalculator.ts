import { LogService } from '../services/LogService.js';
import type { LayoutConfig } from '../utils/layoutManager.js';

/**
 * Result of layout calculation containing optimal grid dimensions
 */
export interface LayoutConfiguration {
  cols: number;
  rows: number;
  windowWidth: number;
  paneDistribution: number[]; // Number of panes per column
  actualPaneWidth: number;
}

/**
 * LayoutCalculator - Determines optimal grid layout for content panes
 *
 * Responsibilities:
 * - Calculate optimal columns/rows for given terminal dimensions
 * - Score layouts based on height comfort and balance
 * - Distribute panes evenly across columns
 *
 * Does NOT:
 * - Create/destroy tmux panes
 * - Apply layouts to tmux
 * - Manage spacer panes
 */
export class LayoutCalculator {
  constructor(private config: LayoutConfig) {}

  /**
   * Calculates the optimal layout for the given number of panes and terminal dimensions
   *
   * Algorithm:
   * 1. Try all possible column counts (from numPanes down to 1)
   * 2. For each, check if it fits in terminal at minimum comfortable size
   * 3. Score layouts based on height, balance, and width comfort
   * 4. Return the highest-scoring layout
   *
   * @param numContentPanes - Number of content panes to layout (excludes sidebar)
   * @param terminalWidth - Total terminal width in cells
   * @param terminalHeight - Total terminal height in cells
   * @returns Optimal layout configuration
   */
  calculateOptimalLayout(
    numContentPanes: number,
    terminalWidth: number,
    terminalHeight: number
  ): LayoutConfiguration {
    const {
      SIDEBAR_WIDTH,
      MIN_COMFORTABLE_WIDTH,
      MAX_COMFORTABLE_WIDTH,
      MIN_COMFORTABLE_HEIGHT,
    } = this.config;
    // If users lower MAX below the default MIN (e.g. max=40), use the lower value
    // for feasibility checks so those narrower-but-intentional layouts are considered.
    const minFeasiblePaneWidth = Math.max(
      1,
      Math.min(MIN_COMFORTABLE_WIDTH, MAX_COMFORTABLE_WIDTH)
    );

    // Special case: welcome pane or no panes
    if (numContentPanes === 0) {
      return {
        cols: 0,
        rows: 0,
        windowWidth: terminalWidth, // Unlimited width for welcome pane
        paneDistribution: [],
        actualPaneWidth: 0,
      };
    }

    // Try all column counts and score them to find the best layout
    let bestLayout: LayoutConfiguration | null = null;
    let bestScore = -1;

    for (let cols = numContentPanes; cols >= 1; cols--) {
      const rows = Math.ceil(numContentPanes / cols);
      const columnBorders = cols - 1; // Vertical borders between columns
      const rowBorders = rows - 1; // Horizontal borders between rows

      // Calculate minimum required dimensions (can we fit at MIN width?)
      const minRequiredWidth =
        SIDEBAR_WIDTH + cols * minFeasiblePaneWidth + columnBorders;
      const minRequiredHeight = rows * MIN_COMFORTABLE_HEIGHT + rowBorders;

      // Check if this layout fits in terminal at minimum comfortable size
      if (
        minRequiredWidth <= terminalWidth &&
        minRequiredHeight <= terminalHeight
      ) {
        // This layout fits! Now calculate actual pane dimensions

        // Calculate ideal window max-width (cap each pane at MAX_COMFORTABLE_WIDTH)
        // Window should be: sidebar + (columns * MAX width) + borders OR terminal width, whichever is smaller
        const idealMaxWidth =
          SIDEBAR_WIDTH + cols * MAX_COMFORTABLE_WIDTH + columnBorders;
        const windowWidth = Math.min(idealMaxWidth, terminalWidth);

        // Calculate actual pane width using the constrained windowWidth (not terminalWidth)
        // This ensures panes don't exceed MAX_COMFORTABLE_WIDTH
        const effectiveContentWidth = windowWidth - SIDEBAR_WIDTH - columnBorders;
        const actualPaneWidth = effectiveContentWidth / cols;

        // Calculate pane distribution for spanning (e.g., [2, 1, 1, 1])
        const distribution = this.distributePanes(numContentPanes, cols);

        // Calculate pane height
        const availableHeight = terminalHeight - rowBorders;
        const paneHeight = Math.floor(availableHeight / rows);

        // Score this layout (higher is better)
        const score = this.scoreLayout(
          numContentPanes,
          cols,
          rows,
          actualPaneWidth,
          paneHeight,
          terminalHeight
        );

        // Update best if this score is higher, OR if tied but with fewer columns (more width per pane)
        const isBetter = score > bestScore || (score === bestScore && cols < (bestLayout?.cols || Infinity));

        if (isBetter) {
          bestScore = score;
          bestLayout = {
            cols,
            rows,
            windowWidth,
            paneDistribution: distribution,
            actualPaneWidth,
          };
        }
      }
    }

    // Return the best layout we found
    if (bestLayout) {
      return bestLayout;
    }

    // Ultimate fallback: single column (forced cramped layout if terminal too small)
    return {
      cols: 1,
      rows: numContentPanes,
      windowWidth: terminalWidth,
      paneDistribution: [numContentPanes],
      actualPaneWidth: terminalWidth - SIDEBAR_WIDTH,
    };
  }

  /**
   * Distributes panes as evenly as possible across columns
   * Examples:
   *   5 panes, 3 cols → [2, 2, 1] (first 2 columns get extra pane)
   *   5 panes, 4 cols → [2, 1, 1, 1] (first column gets extra pane)
   *   6 panes, 3 cols → [2, 2, 2] (perfectly even)
   */
  distributePanes(numPanes: number, cols: number): number[] {
    const distribution: number[] = [];
    const basePerCol = Math.floor(numPanes / cols);
    const remainder = numPanes % cols;

    for (let i = 0; i < cols; i++) {
      // First 'remainder' columns get an extra pane
      distribution.push(basePerCol + (i < remainder ? 1 : 0));
    }

    return distribution;
  }

  /**
   * Scores a layout based on multiple factors
   * Prefers layouts that:
   * 1. Have more vertical space (bigger height)
   * 2. Are more balanced (fewer rows, but not too wide)
   * 3. Don't have a single pane in the last row
   *
   * @returns Score (0-1, higher is better)
   */
  private scoreLayout(
    numContentPanes: number,
    cols: number,
    rows: number,
    actualPaneWidth: number,
    paneHeight: number,
    terminalHeight: number
  ): number {
    const { MAX_COMFORTABLE_WIDTH } = this.config;

    // Prefer layouts that:
    // 1. Have more vertical space (bigger height)
    // 2. Are more balanced (fewer rows, but not too wide)
    // 3. Don't have a single pane in the last row
    const panesInLastRow = (numContentPanes % cols) || cols;
    const balanceScore = panesInLastRow === 1 ? 0.5 : 1.0; // Penalize single pane in last row
    const heightScore = paneHeight / terminalHeight; // More vertical space is better
    const widthScore = actualPaneWidth <= MAX_COMFORTABLE_WIDTH ? 1.0 : 0.8; // Prefer panes within comfortable width

    return balanceScore * heightScore * widthScore;
  }
}
