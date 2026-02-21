import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';
import type { LayoutConfig } from '../utils/layoutManager.js';
import type { LayoutConfiguration } from './LayoutCalculator.js';
import { resolveDistPath } from '../utils/runtimePaths.js';

// Spacer pane identifier
const SPACER_PANE_TITLE = 'dmux-spacer';
const MIN_SPACER_WIDTH = 20; // Minimum width for spacer pane (tmux may reject layouts with tiny panes)

/**
 * SpacerManager - Manages spacer panes for preventing overly-wide content panes
 *
 * Responsibilities:
 * - Determine when a spacer pane is needed
 * - Create spacer panes (visual padding panes with dots)
 * - Destroy spacer panes when no longer needed
 * - Find existing spacer panes
 *
 * Background:
 * When the last row of a grid layout has fewer panes than other rows,
 * tmux will stretch those panes to fill the width. This can make panes
 * uncomfortably wide (e.g., >100 chars). Spacer panes fill that extra
 * space with non-interactive visual padding.
 *
 * Does NOT:
 * - Calculate layouts
 * - Apply layouts to tmux
 * - Manage content panes
 */
export class SpacerManager {
  private tmuxService = TmuxService.getInstance();

  constructor(private config: LayoutConfig) {}

  /**
   * Finds the spacer pane ID if it exists
   * @returns Spacer pane ID or null if not found
   */
  findSpacerPane(): string | null {
    try {
      const allPanes = this.tmuxService.getAllPaneIdsSync();
      for (const paneId of allPanes) {
        const title = this.tmuxService.getPaneTitleSync(paneId);
        if (title === SPACER_PANE_TITLE) {
          return paneId;
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * Creates a spacer pane that displays static gray dots
   * Always splits from the last content pane to ensure spacer comes last
   *
   * @param lastContentPaneId - The ID of the last content pane to split from
   * @returns The new spacer pane ID
   * @throws Error if pane creation fails
   *
   * CRITICAL FIX: Added validation that the target pane exists before attempting to split.
   * This prevents crashes when the pane list becomes stale during rapid resize/pane operations.
   */
  createSpacerPane(lastContentPaneId: string): string {
    try {
      // CRITICAL FIX: Verify the target pane exists before trying to split from it
      // This prevents "can't find pane" errors during rapid operations
      const allPanes = this.tmuxService.getAllPaneIdsSync();
      if (!allPanes.includes(lastContentPaneId)) {
        throw new Error(`Target pane ${lastContentPaneId} no longer exists`);
      }

      // Store the currently active pane
      let originalPaneId: string;
      try {
        originalPaneId = this.tmuxService.getCurrentPaneIdSync();
      } catch {
        // If we can't get current pane, use the last content pane as fallback
        originalPaneId = lastContentPaneId;
      }

      // Switch to the last content pane
      this.tmuxService.selectPaneSync(lastContentPaneId);

      // Create a new pane running our spacer-pane script (just dots, no ASCII art)
      // This will split from the currently active pane (the last content pane)
      const scriptPath = resolveDistPath('spacer-pane.js');

      const newPaneId = this.tmuxService.splitPaneSync({
        command: `node '${scriptPath}'`
      });

      // Set the pane title to identify it as a spacer
      this.tmuxService.setPaneTitleSync(newPaneId, SPACER_PANE_TITLE);

      // Return focus to the originally active pane (if it still exists)
      try {
        const currentPanes = this.tmuxService.getAllPaneIdsSync();
        if (currentPanes.includes(originalPaneId)) {
          this.tmuxService.selectPaneSync(originalPaneId);
        }
      } catch {
        // Ignore errors restoring focus - non-critical
      }

      // LogService.getInstance().debug(
      //   `Created spacer pane: ${newPaneId} (split from ${lastContentPaneId}, restored focus to ${originalPaneId})`,
      //   'Layout'
      // );
      return newPaneId;
    } catch (error) {
      // LogService.getInstance().debug(`Failed to create spacer pane: ${error}`, 'Layout');
      throw error;
    }
  }

  /**
   * Destroys a spacer pane by ID
   * @param spacerId - The pane ID to destroy
   */
  destroySpacerPane(spacerId: string): void {
    try {
      this.tmuxService.killPaneSync(spacerId);
      // LogService.getInstance().debug(`Destroyed spacer pane: ${spacerId}`, 'Layout');
    } catch (error) {
      // LogService.getInstance().debug(`Failed to destroy spacer pane: ${error}`, 'Layout');
    }
  }

  /**
   * Determines if we need a spacer pane based on layout configuration
   *
   * We need a spacer when panes in the last row would exceed MAX_COMFORTABLE_WIDTH
   * if stretched to fill the available width.
   *
   * Algorithm:
   * 1. Check if last row is incomplete (fewer panes than other rows)
   * 2. Calculate width per pane if distributed evenly
   * 3. If width > MAX_COMFORTABLE_WIDTH, we need a spacer
   * 4. Verify spacer would be wide enough (>= MIN_SPACER_WIDTH)
   *
   * @param numContentPanes - Total number of content panes
   * @param layout - Calculated layout configuration
   * @returns true if spacer is needed
   */
  needsSpacerPane(numContentPanes: number, layout: LayoutConfiguration): boolean {
    const { cols, rows, windowWidth } = layout;

    // No spacer needed if we have no content or only one column
    if (cols === 0 || cols === 1) return false;

    // Calculate number of panes in last row (row-based layout)
    // For 5 panes in 3 cols: (5 % 3) || 3 = 2 (last row has 2 panes)
    // For 6 panes in 3 cols: (6 % 3) || 3 = 3 (last row is full)
    const panesInLastRow = (numContentPanes % cols) || cols;

    // If last row is full, no spacer needed
    if (panesInLastRow === cols) return false;

    // Calculate available width for the last row
    const contentWidth = windowWidth - this.config.SIDEBAR_WIDTH - 1;
    const bordersInLastRow = panesInLastRow - 1;
    const availableWidth = contentWidth - bordersInLastRow;

    // Calculate width per pane if we distribute evenly
    const widthPerPane = availableWidth / panesInLastRow;

  //     LogService.getInstance().debug(
  //       `Spacer check: ${panesInLastRow} panes in last row, ${Math.round(availableWidth)} available width, ${Math.round(widthPerPane)} per pane (max: ${this.config.MAX_COMFORTABLE_WIDTH})`,
  //       'Layout'
  //     );

    // Need spacer if distributing width evenly would exceed comfortable width
    if (widthPerPane <= this.config.MAX_COMFORTABLE_WIDTH) {
      return false;
    }

    // Calculate what the spacer width would be
    const contentPaneWidth = this.config.MAX_COMFORTABLE_WIDTH;
    const totalBorders = panesInLastRow; // Total borders if we add spacer (between N+1 panes)
    const totalContentWidth = panesInLastRow * contentPaneWidth;
    const spacerWidth = contentWidth - totalContentWidth - totalBorders;

    // Only use spacer if it would be wide enough (avoid tmux rejecting tiny panes)
    if (spacerWidth < MIN_SPACER_WIDTH) {
  //       LogService.getInstance().debug(
  //         `Spacer would be too narrow (${spacerWidth} < ${MIN_SPACER_WIDTH}), skipping spacer`,
  //         'Layout'
  //       );
      return false;
    }

    return true;
  }
}
