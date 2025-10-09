import { execSync } from 'child_process';
import type { PanePosition } from '../types.js';

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

export const applySmartLayout = (paneCount: number) => {
  try {
    if (paneCount <= 2) {
      execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
    } else if (paneCount === 3) {
      execSync('tmux select-layout main-horizontal', { stdio: 'pipe' });
    } else if (paneCount === 4) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } else if (paneCount >= 5) {
      // For 5+ panes: 2 panes on top, 3+ panes on bottom
      applyCustomTwoRowLayout(paneCount);
    }

    execSync('tmux refresh-client', { stdio: 'pipe' });
  } catch (error) {
    try {
      execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
    } catch {}
  }
};

/**
 * Creates a custom layout with 2 panes on top and remaining panes on bottom
 * For 5 panes: 2 on top, 3 on bottom
 * For 6 panes: 2 on top, 4 on bottom
 * etc.
 */
const applyCustomTwoRowLayout = (paneCount: number) => {
  try {
    // Get all pane IDs and their positions
    const paneInfo = execSync('tmux list-panes -F "#{pane_id} #{pane_index}"', {
      encoding: 'utf-8',
      stdio: 'pipe',
    })
      .trim()
      .split('\n')
      .map(line => {
        const [id, index] = line.split(' ');
        return { id, index: parseInt(index) };
      })
      .sort((a, b) => a.index - b.index);

    if (paneInfo.length !== paneCount) {
      throw new Error('Pane count mismatch');
    }

    // Start with tiled layout
    execSync('tmux select-layout tiled', { stdio: 'pipe' });

    // Strategy: Use main-horizontal layout and adjust
    // main-horizontal gives us one pane on top, rest on bottom
    // Then we'll adjust the top pane to be split in half

    // Get window dimensions
    const windowInfo = execSync(
      'tmux display-message -p "#{window_width} #{window_height}"',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    const [windowWidth, windowHeight] = windowInfo.split(' ').map(n => parseInt(n));

    // Calculate target dimensions
    const topRowHeight = Math.floor(windowHeight / 2);
    const bottomRowHeight = windowHeight - topRowHeight - 1; // -1 for border

    // We need to manually position panes
    // Top row: panes 0 and 1 (side by side)
    // Bottom row: panes 2, 3, 4, etc. (side by side)

    const topPaneWidth = Math.floor(windowWidth / 2);
    const bottomPaneCount = paneCount - 2;
    const bottomPaneWidth = Math.floor(windowWidth / bottomPaneCount);

    // Build a custom layout string
    // tmux layout format: {width}x{height},{x},{y},{pane_id}
    // For horizontal split at root: {width}x{height},{x},{y}[layout1,layout2]
    // For vertical split: {width}x{height},{x},{y}{pane1,pane2}

    // Extract numeric pane IDs (remove the % prefix)
    const pane0Num = paneInfo[0].id.replace('%', '');
    const pane1Num = paneInfo[1].id.replace('%', '');

    // Construct layout string for our desired 2-row layout
    // Format: widthxheight,x,y[top_row{bottom_row}]
    // top_row is a horizontal split: widthxheight,x,y{pane0,pane1}
    // bottom_row is a horizontal split: widthxheight,x,y{pane2,pane3,...}

    // Top row layout (2 panes side by side)
    const topRowLayout = `${windowWidth}x${topRowHeight},0,0{${topPaneWidth}x${topRowHeight},0,0,${pane0Num},${windowWidth - topPaneWidth - 1}x${topRowHeight},${topPaneWidth + 1},0,${pane1Num}}`;

    // Bottom row layout (remaining panes side by side)
    let bottomRowParts: string[] = [];
    let currentX = 0;
    for (let i = 2; i < paneCount; i++) {
      const isLast = i === paneCount - 1;
      const width = isLast ? windowWidth - currentX : bottomPaneWidth;
      const paneNum = paneInfo[i].id.replace('%', '');
      bottomRowParts.push(
        `${width}x${bottomRowHeight},${currentX},${topRowHeight + 1},${paneNum}`
      );
      currentX += width + 1;
    }
    const bottomRowLayout = `${windowWidth}x${bottomRowHeight},0,${topRowHeight + 1}{${bottomRowParts.join(',')}}`;

    // Complete layout
    const layoutString = `${windowWidth}x${windowHeight},0,0[${topRowLayout},${bottomRowLayout}]`;

    // Apply the layout
    execSync(`tmux select-layout '${layoutString}'`, { stdio: 'pipe' });

  } catch (error) {
    // Fallback to tiled on any error
    try {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } catch {}
  }
};
