import { execSync } from 'child_process';
import type { PanePosition } from '../types.js';
import { LogService } from '../services/LogService.js';

// Layout configuration - adjust these to change layout behavior
export const SIDEBAR_WIDTH = 40;
export const MIN_COMFORTABLE_WIDTH = 60;  // Minimum chars for comfortable code viewing
export const MAX_COMFORTABLE_WIDTH = 120; // Maximum chars before too wide for comfort
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
  }

  return checksum.toString(16);
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
 * Gets content pane IDs (excludes control pane)
 */
export const getContentPaneIds = (controlPaneId: string): string[] => {
  const allPanes = getAllPaneIds();
  return allPanes.filter(id => id !== controlPaneId);
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
const generateSidebarGridLayout = (
  controlPaneId: string,
  contentPanes: string[],
  sidebarWidth: number,
  windowWidth: number,
  windowHeight: number,
  columns: number
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

  // For height, account for borders between rows
  // If we have 2 rows with 1 border, total consumed = row1 + 1 + row2 = windowHeight
  const bordersHeight = rows - 1; // Number of borders between rows
  const availableHeight = windowHeight - bordersHeight;
  const paneHeight = Math.floor(availableHeight / rows);

  // Extract numeric ID from controlPaneId (e.g., %1 -> 1)
  const sidebarId = controlPaneId.replace('%', '');

  // Build grid rows (vertical splits within content area)
  const gridRows: string[] = [];
  let paneIndex = 0;
  let currentY = 0; // Track Y position relative to content area

  for (let row = 0; row < rows; row++) {
    const rowPanes: string[] = [];
    let relativeX = 0; // Track X position relative to row container

    // Calculate height for this row
    // Last row gets remainder to account for rounding
    let rowHeight: number;
    if (row === rows - 1) {
      // Last row: use all remaining height
      rowHeight = windowHeight - currentY;
    } else {
      rowHeight = paneHeight;
    }

    for (let col = 0; col < cols; col++) {
      if (paneIndex >= numContentPanes) break;

      const paneId = contentPanes[paneIndex].replace('%', '');

      // Calculate width for this column
      // Last column gets remainder to account for rounding
      let colWidth: number;
      if (col === cols - 1 || paneIndex === numContentPanes - 1) {
        // Last column or last pane: use all remaining width
        colWidth = contentWidth - relativeX;
      } else {
        colWidth = paneWidth;
      }

      // Use relative coordinates within the row container
      rowPanes.push(`${colWidth}x${rowHeight},${relativeX},0,${paneId}`);
      paneIndex++;

      // Move X position right by actual pane width + 1 for border (except on last column)
      if (col < cols - 1) {
        relativeX += colWidth + 1;
      }
    }

    // Wrap multi-pane rows in horizontal container
    if (rowPanes.length > 1) {
      // Horizontal split = use curly braces {}
      // Position relative to content area
      gridRows.push(`${contentWidth}x${rowHeight},0,${currentY}{${rowPanes.join(',')}}`);
    } else if (rowPanes.length === 1) {
      // Single pane - no container needed, just specify the pane
      // Format: WxH,X,Y,pane_id where X=relativeX (0), Y=0 (relative to row)
      // We need to change Y from 0 to currentY
      // rowPanes[0] is like "127x26,0,0,9" and we want "127x26,0,27,9"
      const paneStr = rowPanes[0];
      const parts = paneStr.split(',');
      parts[2] = currentY.toString(); // Update Y coordinate
      gridRows.push(parts.join(','));
    }

    // Move Y position down by pane height + 1 for border (except on last row)
    if (row < rows - 1) {
      currentY += paneHeight + 1;
    }
  }

  // Build content area container (vertical splits of rows)
  let contentArea: string;
  if (gridRows.length > 1) {
    // Multiple rows = vertical split (use square brackets)
    // Position relative to root container
    contentArea = `${contentWidth}x${windowHeight},${contentStartX},0[${gridRows.join(',')}]`;
  } else if (gridRows.length === 1) {
    // Single row - need to adjust X position from 0 to contentStartX
    // since it's not nested in a content area container
    contentArea = gridRows[0].replace(/^(\d+x\d+),0,/, `$1,${contentStartX},`);
  } else {
    // No content panes
    return '';
  }

  // Build root container (horizontal split of sidebar and content)
  const sidebar = `${sidebarWidth}x${windowHeight},0,0,${sidebarId}`;
  const layoutWithoutChecksum = `${windowWidth}x${windowHeight},0,0{${sidebar},${contentArea}}`;

  // Calculate checksum and prepend to layout string
  const checksum = calculateLayoutChecksum(layoutWithoutChecksum);
  return `${checksum},${layoutWithoutChecksum}`;
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
 */
export const enforceControlPaneSize = (
  controlPaneId: string,
  width: number
): void => {
  try {
    const contentPanes = getContentPaneIds(controlPaneId);

    // If we only have the control pane, nothing to enforce
    if (contentPanes.length === 0) {
      return;
    }

    const numContentPanes = contentPanes.length;

    // Apply layout based on number of content panes
    try {
      if (numContentPanes === 1) {
        // 1 pane: sidebar + full-width content
        execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
        execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
      } else if (numContentPanes === 2) {
        // 2 panes: smart layout decision based on available width
        const dimensions = getWindowDimensions();
        const contentWidth = dimensions.width - width - 1; // -1 for border
        const sideBySideWidth = Math.floor(contentWidth / 2);

        // Decide layout: if side-by-side would be too narrow, stack vertically
        if (sideBySideWidth < MIN_COMFORTABLE_WIDTH) {
          // Too narrow for side-by-side - use vertical stack
          execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
          execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
        } else if (contentWidth > MAX_COMFORTABLE_WIDTH) {
          // Content area is wide - split side-by-side
          // First apply even-horizontal to get panes side-by-side
          execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });

          // Resize sidebar back to correct width
          execSync(`tmux resize-pane -t '${controlPaneId}' -x ${width}`, { stdio: 'pipe' });

          // Calculate and apply equal width to content panes
          const paneWidth = Math.floor(contentWidth / 2);
          for (const paneId of contentPanes) {
            execSync(`tmux resize-pane -t '${paneId}' -x ${paneWidth}`, { stdio: 'pipe' });
          }
        } else {
          // Content width is comfortable as single column - use vertical stack
          execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
          execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
        }
      } else {
        // 3+ panes: calculate optimal layout based on comfortable reading widths AND heights
        const dimensions = getWindowDimensions();
        const contentWidth = dimensions.width - width - 1;
        const contentHeight = dimensions.height;

        const bestCols = calculateOptimalColumns(numContentPanes, contentWidth, contentHeight);

        // Apply layout based on best column count
        if (bestCols === 1) {
          // Stack vertically
          execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
          execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
        } else if (bestCols >= numContentPanes) {
          // All panes fit in one row - use horizontal layout
          execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
          execSync(`tmux resize-pane -t '${controlPaneId}' -x ${width}`, { stdio: 'pipe' });

          // Balance content panes
          const bordersWidth = numContentPanes - 1;
          const paneWidth = Math.floor((contentWidth - bordersWidth) / numContentPanes);
          for (const paneId of contentPanes) {
            execSync(`tmux resize-pane -t '${paneId}' -x ${paneWidth}`, { stdio: 'pipe' });
          }
        } else {
          // Multi-row grid needed - generate custom layout string
          const layoutString = generateSidebarGridLayout(
            controlPaneId,
            contentPanes,
            width,
            dimensions.width,
            dimensions.height,
            bestCols
          );

          if (layoutString) {
            try {
              execSync(`tmux select-layout '${layoutString}'`, { stdio: 'pipe' });
            } catch (layoutError: any) {
              // Fallback to main-vertical (clean vertical stack with full-height sidebar)
              // This is better than creating unusable panes
              execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
              execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
            }
          }
        }
      }
    } catch (layoutError: any) {
      // If layout fails, fall back to simple resize
      try {
        execSync(`tmux resize-pane -t '${controlPaneId}' -x ${width}`, { stdio: 'pipe' });
      } catch {
        // Ignore if resize also fails
      }
    }

    // Refresh to apply changes (but don't select the pane - don't steal focus!)
    execSync('tmux refresh-client', { stdio: 'pipe' });
  } catch (error) {
    // Log error for debugging but don't crash
    const msg = 'Layout enforcement failed';
    console.error(msg, error);
    LogService.getInstance().error(msg, 'tmux', undefined, error instanceof Error ? error : undefined);
  }
};

