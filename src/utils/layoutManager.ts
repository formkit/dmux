import { getWindowDimensions } from './tmux.js';
import { TmuxService } from '../services/TmuxService.js';
import { LogService } from '../services/LogService.js';
import { TMUX_PANE_CREATION_DELAY, TMUX_SIDEBAR_SETTLE_DELAY } from '../constants/timing.js';

// Import new focused classes
import { LayoutCalculator, type LayoutConfiguration } from '../layout/LayoutCalculator.js';
import { SpacerManager } from '../layout/SpacerManager.js';
import { TmuxLayoutApplier } from '../layout/TmuxLayoutApplier.js';

/**
 * Configurable layout parameters
 * These can be overridden via settings or environment
 */
export interface LayoutConfig {
  SIDEBAR_WIDTH: number; // Fixed sidebar width (default: 40)
  MIN_COMFORTABLE_WIDTH: number; // Min pane width before creating rows (default: 60)
  MAX_COMFORTABLE_WIDTH: number; // Max pane width for readability (default: 100)
  MIN_COMFORTABLE_HEIGHT: number; // Min pane height (default: 15)
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  SIDEBAR_WIDTH: 40,
  MIN_COMFORTABLE_WIDTH: 50,
  MAX_COMFORTABLE_WIDTH: 80,
  MIN_COMFORTABLE_HEIGHT: 15,
};

// Export individual constants for convenience (allows direct imports)
export const SIDEBAR_WIDTH = DEFAULT_LAYOUT_CONFIG.SIDEBAR_WIDTH;
export const MIN_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_WIDTH;
export const MAX_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MAX_COMFORTABLE_WIDTH;
export const MIN_COMFORTABLE_HEIGHT = DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_HEIGHT;

// Re-export LayoutConfiguration type for backward compatibility
export type { LayoutConfiguration };

// Cache last layout dimensions to avoid unnecessary spacer recreation
let lastLayoutDimensions: { width: number; height: number; paneCount: number } | null = null;

/**
 * MASTER LAYOUT FUNCTION
 * Single entry point for all layout operations
 * Called on: initial setup, pane creation, pane deletion, terminal resize
 *
 * Algorithm:
 * 1. Filter out existing spacer from content panes
 * 2. Calculate optimal layout for real content panes
 * 3. Determine if spacer is needed
 * 4. Destroy existing spacer (if present)
 * 5. Create new spacer (if needed)
 * 6. Resize sidebar (before window resize)
 * 7. Resize window dimensions
 * 8. Re-enforce sidebar width (after window resize)
 * 9. Apply layout to tmux
 */
export async function recalculateAndApplyLayout(
  controlPaneId: string,
  contentPaneIds: string[],
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Promise<void> {
  // Create class instances with config
  const calculator = new LayoutCalculator(config);
  const spacerManager = new SpacerManager(config);
  const layoutApplier = new TmuxLayoutApplier(config);

  // Step 1: Filter out any existing spacer from content panes
  const existingSpacerId = spacerManager.findSpacerPane();
  const realContentPanes = contentPaneIds.filter(id => id !== existingSpacerId);

  // Check if dimensions and pane count have changed since last layout
  const dimensionsUnchanged =
    lastLayoutDimensions &&
    lastLayoutDimensions.width === terminalWidth &&
    lastLayoutDimensions.height === terminalHeight &&
    lastLayoutDimensions.paneCount === realContentPanes.length;

  if (dimensionsUnchanged && existingSpacerId) {
    LogService.getInstance().debug(
      `Layout unchanged (${terminalWidth}x${terminalHeight}, ${realContentPanes.length} panes), skipping spacer recreation`,
      'Layout'
    );
    return;
  }

  // Update last layout dimensions
  lastLayoutDimensions = {
    width: terminalWidth,
    height: terminalHeight,
    paneCount: realContentPanes.length,
  };

  // Step 2: Calculate layout for real content panes only
  const layout = calculator.calculateOptimalLayout(
    realContentPanes.length,
    terminalWidth,
    terminalHeight
  );

  // Step 3: Determine if we need a spacer pane
  const needsSpacer = spacerManager.needsSpacerPane(realContentPanes.length, layout);

  // Step 4: Manage spacer pane creation/destruction
  // ALWAYS destroy existing spacer on layout recalc to ensure fresh positioning
  let spacerId: string | null = null;

  LogService.getInstance().debug(
    `Spacer management: needs=${needsSpacer}, existing=${existingSpacerId || 'none'}`,
    'Layout'
  );

  // Destroy existing spacer if present (we'll recreate if needed)
  if (existingSpacerId) {
    LogService.getInstance().debug(`Destroying existing spacer for recreation: ${existingSpacerId}`, 'Layout');
    spacerManager.destroySpacerPane(existingSpacerId);
  }

  // Create new spacer if needed
  if (needsSpacer) {
    try {
      const lastContentPaneId = realContentPanes[realContentPanes.length - 1];
      if (!lastContentPaneId) {
        throw new Error('No content panes available to split from');
      }
      spacerId = spacerManager.createSpacerPane(lastContentPaneId);
      LogService.getInstance().debug(`Created fresh spacer pane: ${spacerId}`, 'Layout');

      // CRITICAL: Wait for tmux to fully register the new pane before applying layout
      await new Promise(resolve => setTimeout(resolve, TMUX_PANE_CREATION_DELAY));

      // Verify the pane appears in list-panes output
      const tmuxService = TmuxService.getInstance();
      let paneVerified = false;
      for (let attempts = 0; attempts < 3; attempts++) {
        try {
          const allPaneIds = tmuxService.getAllPaneIdsSync();

          if (allPaneIds.includes(spacerId)) {
            paneVerified = true;
            LogService.getInstance().debug(
              `Verified spacer pane ${spacerId} in list-panes (attempt ${attempts + 1})`,
              'Layout'
            );
            break;
          }
        } catch {
          // Pane not ready yet, wait a bit
          if (attempts < 2) await new Promise(resolve => setTimeout(resolve, TMUX_PANE_CREATION_DELAY));
        }
      }

      if (!paneVerified) {
        LogService.getInstance().debug(
          `WARNING: Spacer pane ${spacerId} not verified, continuing anyway`,
          'Layout'
        );
        // Don't throw - continue and let it fail with better logs
      }
    } catch (error) {
      LogService.getInstance().debug(`Continuing without spacer pane: ${error}`, 'Layout');
      spacerId = null;
    }
  }

  // Step 5: Build final pane list (real panes + spacer if exists)
  let finalContentPanes = spacerId ? [...realContentPanes, spacerId] : realContentPanes;

  // CRITICAL: Sort panes by tmux index, then put spacer LAST
  // Tmux applies layout geometry by pane index order!
  const paneIndices = new Map<string, number>();
  try {
    const tmuxService = TmuxService.getInstance();
    // Get pane index from tmux (pane_index format variable)
    const indexOutput = tmuxService.listPanesSync('#{pane_id}=#{pane_index}');
    const indexLines = indexOutput.split('\n').filter(l => l.trim());

    indexLines.forEach(line => {
      const [paneId, indexStr] = line.split('=');
      if (paneId && indexStr) {
        paneIndices.set(paneId, parseInt(indexStr, 10));
      }
    });

    // Sort by index, but force spacer to the end
    finalContentPanes = finalContentPanes.sort((a, b) => {
      // Spacer always last
      if (a === spacerId) return 1;
      if (b === spacerId) return -1;

      // Otherwise sort by tmux index
      const indexA = paneIndices.get(a) || 0;
      const indexB = paneIndices.get(b) || 0;
      return indexA - indexB;
    });

    LogService.getInstance().debug(
      `Pane order sorted by index: ${finalContentPanes.map(p => `${p}(idx:${paneIndices.get(p)})`).join(', ')}`,
      'Layout'
    );
  } catch (err) {
    LogService.getInstance().debug(`Failed to sort by index: ${err}`, 'Layout');
  }

  // Step 6: Recalculate layout with spacer included if present
  const finalLayout = spacerId
    ? calculator.calculateOptimalLayout(finalContentPanes.length, terminalWidth, terminalHeight)
    : layout;

  // Log current tmux state before applying layout
  try {
    const tmuxService = TmuxService.getInstance();
    const positions = tmuxService.getPanePositionsSync();
    const positionsStr = positions.map(p =>
      `${p.paneId} ${p.width}x${p.height} @${p.left},${p.top}`
    ).join('\n');
    LogService.getInstance().debug(`Current pane positions before layout:\n${positionsStr}`, 'Layout');
  } catch {}

  // CRITICAL ORDER: Resize sidebar FIRST (before window), then window
  // This prevents tmux from redistributing window width changes to the sidebar

  // Step 7: Find and verify the actual control pane
  // The control pane ID may change after layout operations, so we need to find it by position
  const tmuxService = TmuxService.getInstance();
  let actualControlPaneId = controlPaneId;
  try {
    // First, verify the provided controlPaneId still exists
    await tmuxService.paneExists(controlPaneId);
  } catch {
    // Control pane ID is stale, find it by position (leftmost pane at x=0)
    // Use the smallest pane at x=0 as the sidebar (allows for slight width variations)
    try {
      const positions = tmuxService.getPanePositionsSync();
      let smallestPaneAtLeft: { id: string; width: number } | null = null;

      for (const pos of positions) {
        // Find the smallest pane at x=0 (likely the sidebar)
        if (pos.left === 0 && (!smallestPaneAtLeft || pos.width < smallestPaneAtLeft.width)) {
          smallestPaneAtLeft = { id: pos.paneId, width: pos.width };
        }
      }

      if (smallestPaneAtLeft) {
        actualControlPaneId = smallestPaneAtLeft.id;
        LogService.getInstance().debug(
          `Control pane ID updated: ${controlPaneId} → ${actualControlPaneId} (width: ${smallestPaneAtLeft.width})`,
          'Layout'
        );
      }
    } catch (findError) {
      LogService.getInstance().debug(`Failed to find control pane by position: ${findError}`, 'Layout');
    }
  }

  // Step 8: Check sidebar width (but DON'T resize yet)
  // We'll let the layout application handle the sizing to avoid pane swapping
  try {
    const currentSidebarWidth = tmuxService.getPaneWidthSync(actualControlPaneId);

    if (currentSidebarWidth !== config.SIDEBAR_WIDTH) {
      LogService.getInstance().debug(
        `Sidebar width mismatch: ${currentSidebarWidth} (current) vs ${config.SIDEBAR_WIDTH} (target), will fix via layout`,
        'Layout'
      );
    } else {
      LogService.getInstance().debug(`Sidebar width already correct: ${config.SIDEBAR_WIDTH}`, 'Layout');
    }
  } catch (error) {
    LogService.getInstance().debug(`Failed to check sidebar width: ${error}`, 'Layout');
  }

  // Step 8: Check window dimensions and resize if needed
  // Do this AFTER sidebar resize so sidebar width is locked
  const currentWindowDims = getWindowDimensions();
  const needsWindowResize =
    currentWindowDims.width !== finalLayout.windowWidth ||
    currentWindowDims.height !== terminalHeight;

  if (needsWindowResize) {
    LogService.getInstance().debug(
      `Resizing window: ${currentWindowDims.width}x${currentWindowDims.height} → ${finalLayout.windowWidth}x${terminalHeight}`,
      'Layout'
    );
    layoutApplier.setWindowDimensions(finalLayout.windowWidth, terminalHeight);

    // Wait for tmux to complete the window resize
    await new Promise(resolve => setTimeout(resolve, TMUX_PANE_CREATION_DELAY));

    // Note: We don't re-enforce sidebar width here anymore
    // The layout application below will set the correct dimensions for all panes
  } else {
    LogService.getInstance().debug(
      `Window dimensions already correct: ${finalLayout.windowWidth}x${terminalHeight}`,
      'Layout'
    );
  }

  // Log window state after sidebar enforcement
  try {
    const windowDims = tmuxService.getWindowDimensionsSync();
    const layout = tmuxService.getCurrentLayoutSync();
    LogService.getInstance().debug(
      `After sidebar enforcement: Window: ${windowDims.width}x${windowDims.height}, Layout: ${layout}`,
      'Layout'
    );
  } catch {}

  // Step 9: Apply the layout to tmux
  layoutApplier.applyPaneLayout(actualControlPaneId, finalContentPanes, finalLayout, terminalHeight);
}

/**
 * Calculates optimal layout configuration based on terminal dimensions
 * Maintained for backward compatibility - delegates to LayoutCalculator
 *
 * @deprecated Use LayoutCalculator class directly for better testability
 */
export function calculateOptimalLayout(
  numContentPanes: number,
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): LayoutConfiguration {
  const calculator = new LayoutCalculator(config);
  return calculator.calculateOptimalLayout(numContentPanes, terminalWidth, terminalHeight);
}

/**
 * Distributes panes as evenly as possible across columns
 * Maintained for backward compatibility - delegates to LayoutCalculator
 *
 * @deprecated Use LayoutCalculator class directly for better testability
 */
export function distributePanes(numPanes: number, cols: number): number[] {
  const calculator = new LayoutCalculator(DEFAULT_LAYOUT_CONFIG);
  return calculator.distributePanes(numPanes, cols);
}
