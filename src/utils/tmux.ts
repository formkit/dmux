import { execSync } from 'child_process';
import type { PanePosition } from '../types.js';

// Sidebar configuration - adjust this to change sidebar width
export const SIDEBAR_WIDTH = 40;

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
  windowHeight: number
): string => {
  // Calculate grid dimensions for content panes
  const numContentPanes = contentPanes.length;

  // For 2-3 panes, prefer vertical stacking. For 4+, use a grid.
  let cols: number;
  let rows: number;

  if (numContentPanes <= 3) {
    // Stack vertically (1 column, multiple rows)
    cols = 1;
    rows = numContentPanes;
  } else {
    // Use grid layout for 4+ panes
    cols = Math.ceil(Math.sqrt(numContentPanes));
    rows = Math.ceil(numContentPanes / cols);
  }

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
  let currentY = 0; // Track actual Y position accounting for borders

  for (let row = 0; row < rows; row++) {
    const rowPanes: string[] = [];
    let currentX = contentStartX;

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
        colWidth = contentWidth - (currentX - contentStartX);
      } else {
        colWidth = paneWidth;
      }

      rowPanes.push(`${colWidth}x${rowHeight},${currentX},${currentY},${paneId}`);
      paneIndex++;

      // Move X position right by pane width + 1 for border (except on last column)
      if (col < cols - 1) {
        currentX += paneWidth + 1;
      }
    }

    // If this row has multiple columns, wrap in horizontal container
    if (rowPanes.length > 1) {
      // Horizontal split = use curly braces {}
      gridRows.push(`${contentWidth}x${rowHeight},${contentStartX},${currentY}{${rowPanes.join(',')}}`);
    } else if (rowPanes.length === 1) {
      // Single pane in row - needs to span full content width, not just paneWidth
      const paneId = contentPanes[paneIndex - 1].replace('%', '');
      gridRows.push(`${contentWidth}x${rowHeight},${contentStartX},${currentY},${paneId}`);
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
    contentArea = `${contentWidth}x${windowHeight},${contentStartX},0[${gridRows.join(',')}]`;
  } else if (gridRows.length === 1) {
    contentArea = gridRows[0];
  } else {
    // No content panes
    return '';
  }

  // Build root container (horizontal split of sidebar and content)
  const sidebar = `${sidebarWidth}x${windowHeight},0,0,${sidebarId}`;
  const root = `${windowWidth}x${windowHeight},0,0{${sidebar},${contentArea}}`;

  // Return without checksum - tmux will calculate it automatically
  return root;
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

        // Comfortable width thresholds for coding
        const MIN_COMFORTABLE_WIDTH = 80;  // Minimum chars for comfortable viewing
        const MAX_COMFORTABLE_WIDTH = 150; // Maximum chars before too wide

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
        // 3+ panes: fallback to main-vertical for now (will implement later)
        execSync(`tmux set-window-option main-pane-width ${width}`, { stdio: 'pipe' });
        execSync('tmux select-layout main-vertical', { stdio: 'pipe' });
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
    console.error('Layout enforcement failed:', error);
  }
};

