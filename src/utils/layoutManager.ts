import { execSync } from "child_process"
import {
  calculateOptimalColumns as tmuxCalculateOptimalColumns,
  generateSidebarGridLayout,
  getWindowDimensions,
  getAllPaneIds,
} from "./tmux.js"
import { LogService } from "../services/LogService.js"
import { TMUX_PANE_CREATION_DELAY, TMUX_SIDEBAR_SETTLE_DELAY } from "../constants/timing.js"

// Spacer pane identifier
const SPACER_PANE_TITLE = "dmux-spacer"

/**
 * Configurable layout parameters
 * These can be overridden via settings or environment
 */
export interface LayoutConfig {
  SIDEBAR_WIDTH: number // Fixed sidebar width (default: 40)
  MIN_COMFORTABLE_WIDTH: number // Min pane width before creating rows (default: 60)
  MAX_COMFORTABLE_WIDTH: number // Max pane width for readability (default: 100)
  MIN_COMFORTABLE_HEIGHT: number // Min pane height (default: 15)
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  SIDEBAR_WIDTH: 40,
  MIN_COMFORTABLE_WIDTH: 50,
  MAX_COMFORTABLE_WIDTH: 80,
  MIN_COMFORTABLE_HEIGHT: 15,
}

// Export individual constants for convenience (allows direct imports)
export const SIDEBAR_WIDTH = DEFAULT_LAYOUT_CONFIG.SIDEBAR_WIDTH
export const MIN_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_WIDTH
export const MAX_COMFORTABLE_WIDTH = DEFAULT_LAYOUT_CONFIG.MAX_COMFORTABLE_WIDTH
export const MIN_COMFORTABLE_HEIGHT =
  DEFAULT_LAYOUT_CONFIG.MIN_COMFORTABLE_HEIGHT

/**
 * Finds the spacer pane ID if it exists
 */
function findSpacerPane(): string | null {
  try {
    const allPanes = getAllPaneIds()
    for (const paneId of allPanes) {
      const title = execSync(
        `tmux display-message -t '${paneId}' -p '#{pane_title}'`,
        { encoding: "utf-8", stdio: "pipe" }
      ).trim()
      if (title === SPACER_PANE_TITLE) {
        return paneId
      }
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Creates a spacer pane that displays static gray dots
 * Always splits from the last content pane to ensure spacer comes last
 * @param lastContentPaneId - The ID of the last content pane to split from
 * Returns the new pane ID
 */
function createSpacerPane(lastContentPaneId: string): string {
  try {
    // Store the currently active pane
    const originalPaneId = execSync(
      `tmux display-message -p '#{pane_id}'`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim()

    // Switch to the last content pane
    execSync(`tmux select-pane -t '${lastContentPaneId}'`, { stdio: "pipe" })

    // Create a new pane running our spacer-pane script (just dots, no ASCII art)
    // This will split from the currently active pane (the last content pane)
    const scriptPath = `${process.cwd()}/dist/spacer-pane.js`

    const newPaneId = execSync(
      `tmux split-window -h -P -F '#{pane_id}' "node '${scriptPath}'"`,
      { encoding: "utf-8", stdio: "pipe" }
    ).trim()

    // Set the pane title to identify it as a spacer
    execSync(`tmux select-pane -t '${newPaneId}' -T '${SPACER_PANE_TITLE}'`, {
      stdio: "pipe"
    })

    // Return focus to the originally active pane
    execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: "pipe" })

    LogService.getInstance().debug(`Created spacer pane: ${newPaneId} (split from ${lastContentPaneId}, restored focus to ${originalPaneId})`, "Layout")
    return newPaneId
  } catch (error) {
    LogService.getInstance().debug(`Failed to create spacer pane: ${error}`, "Layout")
    throw error
  }
}

/**
 * Destroys the spacer pane if it exists
 */
function destroySpacerPane(spacerId: string): void {
  try {
    execSync(`tmux kill-pane -t '${spacerId}'`, { stdio: "pipe" })
    LogService.getInstance().debug(`Destroyed spacer pane: ${spacerId}`, "Layout")
  } catch (error) {
    LogService.getInstance().debug(`Failed to destroy spacer pane: ${error}`, "Layout")
  }
}

/**
 * Determines if we need a spacer pane based on layout configuration
 * We need a spacer when panes in the last row would exceed MAX_COMFORTABLE_WIDTH if stretched to fill
 */
function needsSpacerPane(
  numContentPanes: number,
  layout: LayoutConfiguration,
  config: LayoutConfig
): boolean {
  const { cols, rows } = layout
  const MIN_SPACER_WIDTH = 20 // Minimum width for spacer pane (tmux may reject layouts with tiny panes)

  // No spacer needed if we have no content or only one column
  if (cols === 0 || cols === 1) return false

  // Calculate number of panes in last row (row-based layout)
  // For 5 panes in 3 cols: (5 % 3) || 3 = 2 (last row has 2 panes)
  // For 6 panes in 3 cols: (6 % 3) || 3 = 3 (last row is full)
  const panesInLastRow = (numContentPanes % cols) || cols

  // If last row is full, no spacer needed
  if (panesInLastRow === cols) return false

  // Calculate available width for the last row
  const contentWidth = layout.windowWidth - config.SIDEBAR_WIDTH - 1
  const bordersInLastRow = panesInLastRow - 1
  const availableWidth = contentWidth - bordersInLastRow

  // Calculate width per pane if we distribute evenly
  const widthPerPane = availableWidth / panesInLastRow

  LogService.getInstance().debug(
    `Spacer check: ${panesInLastRow} panes in last row, ${Math.round(availableWidth)} available width, ${Math.round(widthPerPane)} per pane (max: ${config.MAX_COMFORTABLE_WIDTH})`,
    "Layout"
  )

  // Need spacer if distributing width evenly would exceed comfortable width
  if (widthPerPane <= config.MAX_COMFORTABLE_WIDTH) {
    return false
  }

  // Calculate what the spacer width would be
  const contentPaneWidth = config.MAX_COMFORTABLE_WIDTH
  const totalBorders = panesInLastRow // Total borders if we add spacer (between N+1 panes)
  const totalContentWidth = panesInLastRow * contentPaneWidth
  const spacerWidth = contentWidth - totalContentWidth - totalBorders

  // Only use spacer if it would be wide enough (avoid tmux rejecting tiny panes)
  if (spacerWidth < MIN_SPACER_WIDTH) {
    LogService.getInstance().debug(
      `Spacer would be too narrow (${spacerWidth} < ${MIN_SPACER_WIDTH}), skipping spacer`,
      "Layout"
    )
    return false
  }

  return true
}

/**
 * Result of layout calculation
 */
export interface LayoutConfiguration {
  cols: number // Number of columns (0 for welcome-only)
  rows: number // Number of rows
  windowWidth: number // Calculated window width (including sidebar)
  paneDistribution: number[] // Panes per column [2, 2, 1]
  actualPaneWidth: number // Actual width each pane will be (between MIN and MAX)
}

// Cache last layout dimensions to avoid unnecessary spacer recreation
let lastLayoutDimensions: { width: number; height: number; paneCount: number } | null = null

/**
 * MASTER LAYOUT FUNCTION
 * Single entry point for all layout operations
 * Called on: initial setup, pane creation, pane deletion, terminal resize
 */
export function recalculateAndApplyLayout(
  controlPaneId: string,
  contentPaneIds: string[],
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): void {
  // Step 1: Filter out any existing spacer from content panes
  const existingSpacerId = findSpacerPane()
  const realContentPanes = contentPaneIds.filter(id => id !== existingSpacerId)

  // Check if dimensions and pane count have changed since last layout
  const dimensionsUnchanged = lastLayoutDimensions &&
    lastLayoutDimensions.width === terminalWidth &&
    lastLayoutDimensions.height === terminalHeight &&
    lastLayoutDimensions.paneCount === realContentPanes.length

  if (dimensionsUnchanged && existingSpacerId) {
    LogService.getInstance().debug(
      `Layout unchanged (${terminalWidth}x${terminalHeight}, ${realContentPanes.length} panes), skipping spacer recreation`,
      "Layout"
    )
    return
  }

  // Update last layout dimensions
  lastLayoutDimensions = {
    width: terminalWidth,
    height: terminalHeight,
    paneCount: realContentPanes.length
  }

  // Step 2: Calculate layout for real content panes only
  const layout = calculateOptimalLayout(
    realContentPanes.length,
    terminalWidth,
    terminalHeight,
    config
  )

  // Step 3: Determine if we need a spacer pane
  const needsSpacer = needsSpacerPane(realContentPanes.length, layout, config)

  // Step 4: Manage spacer pane creation/destruction
  // ALWAYS destroy existing spacer on layout recalc to ensure fresh positioning
  let spacerId: string | null = null

  LogService.getInstance().debug(
    `Spacer management: needs=${needsSpacer}, existing=${existingSpacerId || 'none'}`,
    "Layout"
  )

  // Destroy existing spacer if present (we'll recreate if needed)
  if (existingSpacerId) {
    LogService.getInstance().debug(`Destroying existing spacer for recreation: ${existingSpacerId}`, "Layout")
    destroySpacerPane(existingSpacerId)
  }

  // Create new spacer if needed
  if (needsSpacer) {
    try {
      const lastContentPaneId = realContentPanes[realContentPanes.length - 1]
      if (!lastContentPaneId) {
        throw new Error('No content panes available to split from')
      }
      spacerId = createSpacerPane(lastContentPaneId)
      LogService.getInstance().debug(`Created fresh spacer pane: ${spacerId}`, "Layout")

      // CRITICAL: Wait for tmux to fully register the new pane before applying layout
      execSync(`sleep ${TMUX_PANE_CREATION_DELAY / 1000}`, { stdio: "pipe" })

      // Verify the pane appears in list-panes output
      let paneVerified = false
      for (let attempts = 0; attempts < 3; attempts++) {
        try {
          const output = execSync('tmux list-panes -F "#{pane_id}"', {
            encoding: 'utf-8',
            stdio: 'pipe',
          }).trim()

          if (output.includes(spacerId)) {
            paneVerified = true
            LogService.getInstance().debug(`Verified spacer pane ${spacerId} in list-panes (attempt ${attempts + 1})`, "Layout")
            break
          }
        } catch {
          // Pane not ready yet, wait a bit
          if (attempts < 2) execSync(`sleep ${TMUX_PANE_CREATION_DELAY / 1000}`, { stdio: "pipe" })
        }
      }

      if (!paneVerified) {
        LogService.getInstance().debug(`WARNING: Spacer pane ${spacerId} not verified, continuing anyway`, "Layout")
        // Don't throw - continue and let it fail with better logs
      }
    } catch (error) {
      LogService.getInstance().debug(`Continuing without spacer pane: ${error}`, "Layout")
      spacerId = null
    }
  }

  // Step 5: Build final pane list (real panes + spacer if exists)
  let finalContentPanes = spacerId
    ? [...realContentPanes, spacerId]
    : realContentPanes

  // CRITICAL: Sort panes by tmux index, then put spacer LAST
  // Tmux applies layout geometry by pane index order!
  const paneIndices = new Map<string, number>()
  try {
    const output = execSync(`tmux list-panes -F '#{pane_index} #{pane_id}'`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim()

    output.split('\n').forEach(line => {
      const [index, id] = line.split(' ')
      if (id) paneIndices.set(id, parseInt(index))
    })

    // Sort by index, but force spacer to the end
    finalContentPanes = finalContentPanes.sort((a, b) => {
      // Spacer always last
      if (a === spacerId) return 1
      if (b === spacerId) return -1

      // Otherwise sort by tmux index
      const indexA = paneIndices.get(a) || 0
      const indexB = paneIndices.get(b) || 0
      return indexA - indexB
    })

    LogService.getInstance().debug(
      `Pane order sorted by index: ${finalContentPanes.map(p => `${p}(idx:${paneIndices.get(p)})`).join(', ')}`,
      "Layout"
    )
  } catch (err) {
    LogService.getInstance().debug(`Failed to sort by index: ${err}`, "Layout")
  }

  // Step 6: Recalculate layout with spacer included if present
  const finalLayout = spacerId
    ? calculateOptimalLayout(
        finalContentPanes.length,
        terminalWidth,
        terminalHeight,
        config
      )
    : layout

  // Log current tmux state before applying layout
  try {
    const currentPanes = execSync('tmux list-panes -F "#{pane_id} #{pane_width}x#{pane_height} @#{pane_left},#{pane_top}"', {
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim()
    LogService.getInstance().debug(`Current pane positions before layout:\n${currentPanes}`, "Layout")
  } catch {}

  // CRITICAL ORDER: Resize sidebar FIRST (before window), then window
  // This prevents tmux from redistributing window width changes to the sidebar

  // Step 1: Check sidebar width and resize if needed
  // Do this BEFORE window resize to lock sidebar width
  let sidebarResized = false
  try {
    const currentSidebarWidth = execSync(
      `tmux display-message -t '${controlPaneId}' -p '#{pane_width}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim()

    if (currentSidebarWidth !== String(config.SIDEBAR_WIDTH)) {
      LogService.getInstance().debug(
        `Resizing sidebar: ${currentSidebarWidth} → ${config.SIDEBAR_WIDTH}`,
        "Layout"
      )
      execSync(`tmux resize-pane -t '${controlPaneId}' -x ${config.SIDEBAR_WIDTH}`, { stdio: "pipe" })
      sidebarResized = true

      // Wait for tmux to settle after sidebar resize
      try {
        execSync(`sleep ${TMUX_SIDEBAR_SETTLE_DELAY / 1000}`, { stdio: "pipe" })
      } catch {}
    } else {
      LogService.getInstance().debug(`Sidebar width already correct: ${config.SIDEBAR_WIDTH}`, "Layout")
    }
  } catch (error) {
    LogService.getInstance().debug(`Failed to check/resize sidebar: ${error}`, "Layout")
  }

  // Step 2: Check window dimensions and resize if needed
  // Do this AFTER sidebar resize so sidebar width is locked
  const currentWindowDims = getWindowDimensions()
  const needsWindowResize = currentWindowDims.width !== finalLayout.windowWidth ||
                            currentWindowDims.height !== terminalHeight

  if (needsWindowResize) {
    LogService.getInstance().debug(
      `Resizing window: ${currentWindowDims.width}x${currentWindowDims.height} → ${finalLayout.windowWidth}x${terminalHeight}`,
      "Layout"
    )
    setWindowDimensions(finalLayout.windowWidth, terminalHeight)

    // Wait for tmux to complete the window resize
    try {
      execSync(`sleep ${TMUX_PANE_CREATION_DELAY / 1000}`, { stdio: "pipe" })
    } catch {}

    // CRITICAL: Re-enforce sidebar width after window resize!
    // Window resizes cause tmux to redistribute width changes to ALL panes including sidebar
    try {
      const sidebarWidthAfterResize = execSync(
        `tmux display-message -t '${controlPaneId}' -p '#{pane_width}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim()

      if (sidebarWidthAfterResize !== String(config.SIDEBAR_WIDTH)) {
        LogService.getInstance().debug(
          `Sidebar changed after window resize: ${sidebarWidthAfterResize} → ${config.SIDEBAR_WIDTH}, fixing`,
          "Layout"
        )
        execSync(`tmux resize-pane -t '${controlPaneId}' -x ${config.SIDEBAR_WIDTH}`, { stdio: "pipe" })

        // Wait for tmux to settle
        try {
          execSync(`sleep ${TMUX_SIDEBAR_SETTLE_DELAY / 1000}`, { stdio: "pipe" })
        } catch {}
      }
    } catch (error) {
      LogService.getInstance().debug(`Failed to re-check sidebar after window resize: ${error}`, "Layout")
    }
  } else {
    LogService.getInstance().debug(
      `Window dimensions already correct: ${finalLayout.windowWidth}x${terminalHeight}`,
      "Layout"
    )
  }

  // Log window state after sidebar enforcement
  try {
    const windowInfo = execSync('tmux display-message -p "Window: #{window_width}x#{window_height}, Layout: #{window_layout}"', {
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim()
    LogService.getInstance().debug(`After sidebar enforcement: ${windowInfo}`, "Layout")
  } catch {}

  applyPaneLayout(controlPaneId, finalContentPanes, finalLayout, terminalHeight, config)
}

/**
 * Calculates optimal layout configuration based on terminal dimensions
 * Prioritizes columns over rows for maximum horizontal space usage
 */
export function calculateOptimalLayout(
  numContentPanes: number,
  terminalWidth: number,
  terminalHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): LayoutConfiguration {
  const {
    SIDEBAR_WIDTH,
    MIN_COMFORTABLE_WIDTH,
    MAX_COMFORTABLE_WIDTH,
    MIN_COMFORTABLE_HEIGHT,
  } = config

  // Special case: welcome pane or no panes
  if (numContentPanes === 0) {
    return {
      cols: 0,
      rows: 0,
      windowWidth: terminalWidth, // Unlimited width for welcome pane
      paneDistribution: [],
      actualPaneWidth: 0,
    }
  }

  // Try all column counts and score them to find the best layout
  let bestLayout: LayoutConfiguration | null = null
  let bestScore = -1

  for (let cols = numContentPanes; cols >= 1; cols--) {
    const rows = Math.ceil(numContentPanes / cols)
    const columnBorders = cols - 1 // Vertical borders between columns
    const rowBorders = rows - 1 // Horizontal borders between rows

    // Calculate minimum required dimensions (can we fit at MIN width?)
    const minRequiredWidth =
      SIDEBAR_WIDTH + cols * MIN_COMFORTABLE_WIDTH + columnBorders
    const minRequiredHeight = rows * MIN_COMFORTABLE_HEIGHT + rowBorders

    // Check if this layout fits in terminal at minimum comfortable size
    if (
      minRequiredWidth <= terminalWidth &&
      minRequiredHeight <= terminalHeight
    ) {
      // This layout fits! Now calculate actual pane dimensions

      // Calculate ideal window max-width (cap each pane at MAX_COMFORTABLE_WIDTH)
      // Window should be: sidebar + (columns * MAX width) + borders OR terminal width, whichever is smaller
      const idealMaxWidth =
        SIDEBAR_WIDTH + cols * MAX_COMFORTABLE_WIDTH + columnBorders
      const windowWidth = Math.min(idealMaxWidth, terminalWidth)

      // Calculate actual pane width using the constrained windowWidth (not terminalWidth)
      // This ensures panes don't exceed MAX_COMFORTABLE_WIDTH
      const effectiveContentWidth = windowWidth - SIDEBAR_WIDTH - columnBorders
      const actualPaneWidth = effectiveContentWidth / cols

      // Calculate pane distribution for spanning (e.g., [2, 1, 1, 1])
      const distribution = distributePanes(numContentPanes, cols)

      // Calculate pane height
      const availableHeight = terminalHeight - rowBorders
      const paneHeight = Math.floor(availableHeight / rows)

      // Score this layout (higher is better)
      // Prefer layouts that:
      // 1. Have more vertical space (bigger height)
      // 2. Are more balanced (fewer rows, but not too wide)
      // 3. Don't have a single pane in the last row
      const panesInLastRow = (numContentPanes % cols) || cols
      const balanceScore = panesInLastRow === 1 ? 0.5 : 1.0 // Penalize single pane in last row
      const heightScore = paneHeight / terminalHeight // More vertical space is better
      const widthScore = actualPaneWidth <= MAX_COMFORTABLE_WIDTH ? 1.0 : 0.8 // Prefer panes within comfortable width

      const score = balanceScore * heightScore * widthScore

      LogService.getInstance().debug(
        `Layout option: ${cols} cols x ${rows} rows, paneHeight=${paneHeight}, score=${score.toFixed(3)}`,
        "Layout"
      )

      // Update best if this score is higher, OR if tied but with fewer columns (more width per pane)
      const isBetter = score > bestScore || (score === bestScore && cols < (bestLayout?.cols || Infinity))

      if (isBetter) {
        bestScore = score
        bestLayout = {
          cols,
          rows,
          windowWidth,
          paneDistribution: distribution,
          actualPaneWidth,
        }
      }
    }
  }

  // Return the best layout we found
  if (bestLayout) {
    LogService.getInstance().debug(
      `Best layout: ${numContentPanes} panes → ${bestLayout.cols} cols x ${bestLayout.rows} rows, window=${bestLayout.windowWidth}, paneWidth=${bestLayout.actualPaneWidth}`,
      "Layout"
    )
    return bestLayout
  }

  // Ultimate fallback: single column (forced cramped layout if terminal too small)
  return {
    cols: 1,
    rows: numContentPanes,
    windowWidth: terminalWidth,
    paneDistribution: [numContentPanes],
    actualPaneWidth: terminalWidth - SIDEBAR_WIDTH,
  }
}

/**
 * Distributes panes as evenly as possible across columns
 * Examples:
 *   5 panes, 3 cols → [2, 2, 1] (first 2 columns get extra pane)
 *   5 panes, 4 cols → [2, 1, 1, 1] (first column gets extra pane)
 *   6 panes, 3 cols → [2, 2, 2] (perfectly even)
 */
export function distributePanes(numPanes: number, cols: number): number[] {
  const distribution: number[] = []
  const basePerCol = Math.floor(numPanes / cols)
  const remainder = numPanes % cols

  for (let i = 0; i < cols; i++) {
    // First 'remainder' columns get an extra pane
    distribution.push(basePerCol + (i < remainder ? 1 : 0))
  }

  return distribution
}

/**
 * Sets window dimensions using tmux resize-window
 * Constrains width (for max-width behavior) while letting height follow terminal
 */
function setWindowDimensions(width: number, height: number): void {
  try {
    // Use manual mode to constrain width, but also set height to match terminal
    execSync(`tmux set-window-option window-size manual`, { stdio: "pipe" })
    execSync(`tmux resize-window -x ${width} -y ${height}`, { stdio: "pipe" })
  } catch (error) {
    // Log but don't fail - some tmux versions may not support this
    LogService.getInstance().warn(
      `Could not set window dimensions to ${width}x${height}: ${error}`,
      "Layout"
    )
  }
}

/**
 * Applies the calculated layout to tmux panes
 * Unified approach: trust the layout calculation for all cases
 */
function applyPaneLayout(
  controlPaneId: string,
  contentPaneIds: string[],
  layout: LayoutConfiguration,
  terminalHeight: number,
  config: LayoutConfig
): void {
  const numContentPanes = contentPaneIds.length

  if (numContentPanes === 0) {
    // No content panes, just resize sidebar
    try {
      execSync(
        `tmux resize-pane -t '${controlPaneId}' -x ${config.SIDEBAR_WIDTH}`,
        { stdio: "pipe" }
      )
    } catch (error) {
      LogService.getInstance().error("Error resizing control pane", "Layout", undefined, error instanceof Error ? error : undefined)
    }
    return
  }

  try {
    // Always use custom layout string generation - unified approach for all cases
    // Use the calculated window dimensions, not current tmux dimensions (may be stale)
    const layoutString = generateSidebarGridLayout(
      controlPaneId,
      contentPaneIds,
      config.SIDEBAR_WIDTH,
      layout.windowWidth,
      terminalHeight,
      layout.cols,
      config.MAX_COMFORTABLE_WIDTH
    )

    if (layoutString) {
      // Log pane state right before applying layout
      try {
        const paneList = execSync('tmux list-panes -F "#{pane_id}=#{pane_index}"', {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim()
        LogService.getInstance().debug(`Panes right before layout apply: ${paneList}`, "Layout")
      } catch {}

      try {
        execSync(`tmux select-layout '${layoutString}'`, { stdio: "pipe" })
        LogService.getInstance().debug(
          "Layout string applied successfully",
          "Layout"
        )
      } catch (layoutError: any) {
        // Log the error for debugging
        const errorMsg = layoutError?.message || String(layoutError)
        LogService.getInstance().debug(
          `Layout string application failed: ${errorMsg}`,
          "Layout"
        )
        LogService.getInstance().debug(
          `Failed layout string: ${layoutString}`,
          "Layout"
        )

        // Fallback to main-vertical if custom layout fails
        execSync(
          `tmux set-window-option main-pane-width ${config.SIDEBAR_WIDTH}`,
          { stdio: "pipe" }
        )
        execSync("tmux select-layout main-vertical", { stdio: "pipe" })
        LogService.getInstance().debug(
          "Fell back to main-vertical layout",
          "Layout"
        )
      }
    } else {
      // Empty layout string - fallback to main-vertical
      LogService.getInstance().debug(
        "Empty layout string, using main-vertical fallback",
        "Layout"
      )
      execSync(
        `tmux set-window-option main-pane-width ${config.SIDEBAR_WIDTH}`,
        { stdio: "pipe" }
      )
      execSync("tmux select-layout main-vertical", { stdio: "pipe" })
    }
  } catch (error) {
    // Fallback: just resize sidebar
    try {
      execSync(
        `tmux resize-pane -t '${controlPaneId}' -x ${config.SIDEBAR_WIDTH}`,
        { stdio: "pipe" }
      )
    } catch {
      // Ignore
    }
  }
}

/**
 * Generates a custom tmux layout string with pane spanning support
 * This is a complex function that will be fully implemented in Phase 8
 */
function generateLayoutString(
  controlPaneId: string,
  contentPanes: string[],
  layout: LayoutConfiguration,
  config: LayoutConfig
): string {
  // TODO: Implement custom layout string generation
  // This will create layout strings like:
  // "layout-string,40x24,0,0{20x24,0,0,1,19x24,21,0[19x12,21,0,2,19x11,21,13,3]}"
  // For now, return empty string to use default layout
  return ""
}
