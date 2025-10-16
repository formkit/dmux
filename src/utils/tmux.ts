import { execSync } from 'child_process';
import type { PanePosition } from '../types.js';
import { LogService } from '../services/LogService.js';
import { recalculateAndApplyLayout } from './layoutManager.js';

// Layout configuration - adjust these to change layout behavior
export const SIDEBAR_WIDTH = 40;
export const MIN_COMFORTABLE_WIDTH = 60;  // Minimum chars for comfortable code viewing
export const MAX_COMFORTABLE_WIDTH = 100; // Maximum chars before too wide for comfort
export const MIN_COMFORTABLE_HEIGHT = 15; // Minimum lines for comfortable pane viewing

/**
 * Calculate tmux layout checksum
 * Based on tmux source: layout.c - layout_checksum()
 */
function calculateLayoutChecksum(layout: string): string {
  let checksum = 0;

  for (let i = 0; i < layout.length; i++) {
    checksum = (checksum >> 1) + ((checksum & 1) << 15);
    checksum += layout.charCodeAt(i);
    checksum &= 0xFFFF; // Mask to 16 bits (critical!)
  }

  // Tmux expects a 4-digit hex checksum (pad with leading zeros)
  return checksum.toString(16).padStart(4, '0');
}

export interface WindowDimensions {
  width: number;
  height: number;
}

/**
 * Gets current window dimensions
 */
export const getWindowDimensions = (): WindowDimensions => {
  try {
    const output = execSync(
      'tmux display-message -p "#{window_width} #{window_height}"',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    const [width, height] = output.split(' ').map(n => parseInt(n));
    return { width, height };
  } catch {
    return { width: 120, height: 40 }; // Fallback dimensions
  }
};

/**
 * Gets current terminal (client) dimensions
 * This is the actual terminal size, not the tmux window size
 */
export const getTerminalDimensions = (): WindowDimensions => {
  try {
    const output = execSync(
      'tmux display-message -p "#{client_width} #{client_height}"',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    const [width, height] = output.split(' ').map(n => parseInt(n));
    return { width, height };
  } catch {
    return { width: 120, height: 40 }; // Fallback dimensions
  }
};

export const getPanePositions = (): PanePosition[] => {
  try {
    const output = execSync(
      `tmux list-panes -F '#{pane_id} #{pane_left} #{pane_top} #{pane_width} #{pane_height}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    return output.split('\n').map(line => {
      const [paneId, left, top, width, height] = line.split(' ');
      return {
        paneId,
        left: parseInt(left),
        top: parseInt(top),
        width: parseInt(width),
        height: parseInt(height)
      };
    });
  } catch {
    return [];
  }
};

/**
 * Gets all pane IDs in current window
 */
export const getAllPaneIds = (): string[] => {
  try {
    const output = execSync('tmux list-panes -F "#{pane_id}"', {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    return output.split('\n').filter(id => id.trim());
  } catch {
    return [];
  }
};

/**
 * Gets content pane IDs (excludes control pane and spacer pane)
 */
export const getContentPaneIds = (controlPaneId: string): string[] => {
  const allPanes = getAllPaneIds();
  return allPanes.filter(id => {
    if (id === controlPaneId) return false;

    // Filter out spacer pane
    try {
      const title = execSync(
        `tmux display-message -t '${id}' -p '#{pane_title}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      return title !== 'dmux-spacer';
    } catch {
      return true; // Include pane if we can't get title
    }
  });
};

/**
 * Creates initial sidebar layout by splitting from control pane
 * @param controlPaneId The pane ID running dmux TUI (left sidebar)
 * @returns The newly created content area pane ID
 */
export const setupSidebarLayout = (controlPaneId: string): string => {
  try {
    // Split horizontally (left-right) from control pane
    const newPaneId = execSync(
      `tmux split-window -h -t '${controlPaneId}' -P -F '#{pane_id}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    // Wait for split to settle
    execSync('sleep 0.1', { stdio: 'pipe' });

    // Resize control pane to fixed width
    enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);

    // Refresh to ensure panes are painted correctly after layout
    execSync('tmux refresh-client', { stdio: 'pipe' });

    return newPaneId;
  } catch (error) {
    throw new Error(`Failed to setup sidebar layout: ${error}`);
  }
};

/**
 * Generates a custom tmux layout string for [Sidebar | Grid] arrangement
 * Format: checksum,WxH,X,Y{child1,child2,...}
 * Each child: WxH,X,Y[pane_id] for leaf or WxH,X,Y{...} for container
 */
export const generateSidebarGridLayout = (
  controlPaneId: string,
  contentPanes: string[],
  sidebarWidth: number,
  windowWidth: number,
  windowHeight: number,
  columns: number,
  maxComfortableWidth: number = MAX_COMFORTABLE_WIDTH
): string => {
  // Calculate grid dimensions for content panes
  const numContentPanes = contentPanes.length;

  // Use provided column count
  const cols = columns;
  const rows = Math.ceil(numContentPanes / cols);

  // Content area dimensions
  // Account for borders: horizontal split adds 1 char, vertical splits add 1 char per row
  const contentWidth = windowWidth - sidebarWidth - 1; // -1 for border between sidebar and content
  const contentStartX = sidebarWidth + 1; // +1 to account for border

  // For width, account for borders between columns
  const bordersWidth = cols - 1;
  const availableWidth = contentWidth - bordersWidth;
  const paneWidth = Math.floor(availableWidth / cols);

  // Check if last pane is a spacer
  const lastPaneIsSpacer = contentPanes.length > 0 && (() => {
    try {
      const lastPaneId = contentPanes[contentPanes.length - 1];
      const title = execSync(
        `tmux display-message -t '${lastPaneId}' -p '#{pane_title}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      return title === 'dmux-spacer';
    } catch {
      return false;
    }
  })();

  // For height, account for borders between rows
  // If we have 2 rows with 1 border, total consumed = row1 + 1 + row2 = windowHeight
  const bordersHeight = rows - 1; // Number of borders between rows
  const availableHeight = windowHeight - bordersHeight;
  const paneHeight = Math.floor(availableHeight / rows);

  // Extract numeric ID from controlPaneId (e.g., %1 -> 1)
  const sidebarId = controlPaneId.replace('%', '');

  // Debug logging
  LogService.getInstance().debug(`generateSidebarGridLayout: ${numContentPanes} panes, ${cols} cols x ${rows} rows`, 'Layout');
  LogService.getInstance().debug(`Window: ${windowWidth}x${windowHeight}, Content: ${contentWidth}x${windowHeight} starting at X=${contentStartX}`, 'Layout');
  LogService.getInstance().debug(`Pane width: ${paneWidth}, borders: ${bordersWidth}`, 'Layout');

  // Build grid rows (vertical splits within content area)
  // Use ABSOLUTE coordinates everywhere (tmux requirement - yes, even inside containers!)
  const gridRows: string[] = [];
  let paneIndex = 0;
  let currentY = 0; // Track Y position (starts at 0, relative to content area)

  for (let row = 0; row < rows; row++) {
    const rowPanes: string[] = [];
    let absoluteX = contentStartX; // Track X position as ABSOLUTE from window origin

    // Calculate height for this row
    // Last row gets remainder to account for rounding
    let rowHeight: number;
    if (row === rows - 1) {
      // Last row: use all remaining height
      rowHeight = windowHeight - currentY;
    } else {
      rowHeight = paneHeight;
    }

    // Determine panes in this row
    const panesInThisRow: string[] = [];
    for (let col = 0; col < cols && paneIndex + col < numContentPanes; col++) {
      panesInThisRow.push(contentPanes[paneIndex + col]);
    }

    // Check if this row has a spacer (last pane is spacer)
    const rowHasSpacer = lastPaneIsSpacer && row === rows - 1 && panesInThisRow.length > 0 &&
      panesInThisRow[panesInThisRow.length - 1] === contentPanes[numContentPanes - 1];

    const numContentPanesInRow = rowHasSpacer ? panesInThisRow.length - 1 : panesInThisRow.length;

    // Calculate widths for this row
    let contentPaneWidths: number[];
    let spacerWidth: number | null = null;

    if (rowHasSpacer) {
      // Row with spacer: content panes get MAX_COMFORTABLE_WIDTH (from config), spacer gets remainder
      const contentPaneWidth = maxComfortableWidth;
      const bordersInRow = panesInThisRow.length - 1; // borders between ALL panes in row
      const totalContentWidth = numContentPanesInRow * contentPaneWidth;
      const remainingWidth = contentWidth - totalContentWidth - bordersInRow;

      LogService.getInstance().debug(
        `Row ${row} with spacer: ${numContentPanesInRow} content panes @ ${contentPaneWidth} = ${totalContentWidth}, borders=${bordersInRow}, spacer=${remainingWidth}`,
        'Layout'
      );

      if (remainingWidth < 0) {
        LogService.getInstance().debug(
          `WARNING: Negative spacer width! contentWidth=${contentWidth}, totalContent=${totalContentWidth}, borders=${bordersInRow}`,
          'Layout'
        );
      }

      contentPaneWidths = Array(numContentPanesInRow).fill(contentPaneWidth);
      spacerWidth = remainingWidth;
    } else {
      // Row without spacer: divide width evenly
      const bordersInRow = panesInThisRow.length - 1;
      const availableWidth = contentWidth - bordersInRow;
      const evenWidth = Math.floor(availableWidth / panesInThisRow.length);
      const remainder = availableWidth - (evenWidth * panesInThisRow.length);

      // CRITICAL: Distribute width evenly, with remainder going to FIRST pane (matches tmux behavior)
      contentPaneWidths = Array(panesInThisRow.length).fill(evenWidth);
      contentPaneWidths[0] += remainder; // First pane gets remainder, not last!
    }

    // Build row panes with calculated widths using ABSOLUTE coordinates
    for (let col = 0; col < panesInThisRow.length; col++) {
      const paneId = panesInThisRow[col].replace('%', '');
      const isSpacerPane = rowHasSpacer && col === panesInThisRow.length - 1;

      const colWidth = isSpacerPane ? spacerWidth! : contentPaneWidths[col];

      // Use ABSOLUTE coordinates (from window origin) - tmux requirement
      rowPanes.push(`${colWidth}x${rowHeight},${absoluteX},${currentY},${paneId}`);

      // Move X position right by pane width + border
      absoluteX += colWidth;
      if (col < panesInThisRow.length - 1) {
        absoluteX += 1; // Add border
      }
    }

    paneIndex += panesInThisRow.length;

    // Wrap multi-pane rows in horizontal container (uses ABSOLUTE coordinates)
    if (rowPanes.length > 1) {
      // Horizontal split = use curly braces {}
      // Row container also uses ABSOLUTE coordinates
      const rowString = `${contentWidth}x${rowHeight},${contentStartX},${currentY}{${rowPanes.join(',')}}`;
      LogService.getInstance().debug(`Row ${row}: ${rowPanes.length} panes → ${rowString}`, 'Layout');
      gridRows.push(rowString);
    } else if (rowPanes.length === 1) {
      // Single pane - no container needed, use ABSOLUTE coordinates
      const paneStr = rowPanes[0];
      const parts = paneStr.split(',');
      parts[1] = contentStartX.toString(); // X absolute
      parts[2] = currentY.toString(); // Y absolute
      const singlePaneString = parts.join(',');
      LogService.getInstance().debug(`Row ${row}: 1 pane → ${singlePaneString}`, 'Layout');
      gridRows.push(singlePaneString);
    }

    // Move Y position down by pane height + 1 for border (except on last row)
    if (row < rows - 1) {
      currentY += paneHeight + 1;
    }
  }

  // Build root container
  const sidebar = `${sidebarWidth}x${windowHeight},0,0,${sidebarId}`;
  let layoutWithoutChecksum: string;

  if (gridRows.length > 1) {
    // Multiple rows: wrap in vertical split container
    const contentArea = `${contentWidth}x${windowHeight},${contentStartX},0[${gridRows.join(',')}]`;
    layoutWithoutChecksum = `${windowWidth}x${windowHeight},0,0{${sidebar},${contentArea}}`;
  } else if (gridRows.length === 1) {
    // Single row: keep the container structure to maintain binary splits
    // tmux only supports 2 children per split, so we need {sidebar, content_container}
    const row = gridRows[0];

    // Adjust the container's X position from 0 to contentStartX
    const contentArea = row.replace(/^(\d+x\d+),0,/, `$1,${contentStartX},`);
    layoutWithoutChecksum = `${windowWidth}x${windowHeight},0,0{${sidebar},${contentArea}}`;

    LogService.getInstance().debug(`Single row layout: {sidebar, content}`, 'Layout');
  } else {
    // No content panes
    return '';
  }

  // Calculate checksum and prepend to layout string
  const checksum = calculateLayoutChecksum(layoutWithoutChecksum);
  const finalLayout = `${checksum},${layoutWithoutChecksum}`;

  LogService.getInstance().debug(`Generated layout string: ${finalLayout}`, 'Layout');

  return finalLayout;
};

/**
 * Calculates optimal number of columns for pane layout based on dimensions
 * @param numPanes Number of panes to arrange
 * @param contentWidth Available width for content panes
 * @param contentHeight Available height for content panes
 * @returns Optimal number of columns
 */
export const calculateOptimalColumns = (
  numPanes: number,
  contentWidth: number,
  contentHeight: number
): number => {
  // Try different numbers of columns to find optimal layout
  let bestCols = 1;
  let bestScore = -1;

  for (let cols = 1; cols <= numPanes; cols++) {
    // Calculate width for this column count
    const bordersWidth = cols - 1;
    const paneWidth = Math.floor((contentWidth - bordersWidth) / cols);

    // Calculate height for this column count
    const rows = Math.ceil(numPanes / cols);
    const bordersHeight = rows - 1;
    const paneHeight = Math.floor((contentHeight - bordersHeight) / rows);

    // Skip if width or height is too small
    if (paneWidth < MIN_COMFORTABLE_WIDTH || paneHeight < MIN_COMFORTABLE_HEIGHT) {
      continue;
    }

    // Score this configuration (prefer balanced layouts)
    // Heavily penalize heights below comfortable threshold
    const widthScore = paneWidth <= MAX_COMFORTABLE_WIDTH ? 1 : 0.5;
    const heightScore = paneHeight >= MIN_COMFORTABLE_HEIGHT * 1.5 ? 1 : 0.7;
    const score = widthScore * heightScore;

    if (score > bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }

  // If no valid layout found, fall back to what gives best height
  if (bestScore === -1) {
    // Find column count that maximizes height while keeping width above minimum
    for (let cols = numPanes; cols >= 1; cols--) {
      const bordersWidth = cols - 1;
      const paneWidth = Math.floor((contentWidth - bordersWidth) / cols);

      if (paneWidth >= MIN_COMFORTABLE_WIDTH * 0.8) { // Allow slightly narrower
        bestCols = cols;
        break;
      }
    }
  }

  return bestCols;
};

/**
 * Enforces left sidebar layout: 40-char wide sidebar on left, content panes in grid on right
 * This maintains the structure: [Sidebar (40 chars, full height) | Content Grid Area]
 *
 * @deprecated This function now delegates to the centralized layout manager.
 * Consider using recalculateAndApplyLayout() directly from layoutManager.ts
 */
export const enforceControlPaneSize = (
  controlPaneId: string,
  width: number
): void => {
  const logService = LogService.getInstance();

  try {
    const contentPanes = getContentPaneIds(controlPaneId);
    logService.debug(`enforceControlPaneSize called: ${contentPanes.length} content panes`, 'Layout');

    // If we only have the control pane, nothing to enforce
    if (contentPanes.length === 0) {
      // Just resize the sidebar
      try {
        execSync(`tmux resize-pane -t '${controlPaneId}' -x ${width}`, { stdio: 'pipe' });
      } catch {
        // Ignore errors
      }
      return;
    }

    // Check if we have only the welcome pane (should not be width-constrained)
    if (contentPanes.length === 1) {
      try {
        const title = execSync(`tmux display-message -t '${contentPanes[0]}' -p '#{pane_title}'`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();

        if (title === 'Welcome') {
          // Welcome pane should use full terminal width, not be constrained
          // Get terminal dimensions and let window follow terminal
          const termDims = getTerminalDimensions();

          // Set window size to match terminal (manual mode but always tracking terminal)
          execSync(`tmux set-window-option window-size manual`, { stdio: 'pipe' });
          execSync(`tmux resize-window -x ${termDims.width} -y ${termDims.height}`, { stdio: 'pipe' });

          // Apply main-vertical layout with fixed sidebar width
          execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
          execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
          execSync('tmux refresh-client', { stdio: 'pipe' });
          return;
        }
      } catch {
        // If we can't get the title, fall through to normal layout
      }
    }

    // Use the new layout manager for regular content panes
    // Read terminal dimensions (not window dimensions which may be stale in manual mode)
    const dimensions = getTerminalDimensions();
    logService.debug(`Terminal dimensions: ${dimensions.width}x${dimensions.height}`, 'Layout');

    recalculateAndApplyLayout(
      controlPaneId,
      contentPanes,
      dimensions.width,
      dimensions.height
    );

    // Refresh to apply changes (but don't select the pane - don't steal focus!)
    execSync('tmux refresh-client', { stdio: 'pipe' });
  } catch (error) {
    // Log error for debugging but don't crash
    const msg = 'Layout enforcement failed';
    LogService.getInstance().error(msg, 'tmux', undefined, error instanceof Error ? error : undefined);
  }
};

