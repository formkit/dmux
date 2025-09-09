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
    } else if (paneCount === 5) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
      try {
        execSync('tmux resize-pane -t 0 -y 50%', { stdio: 'pipe' });
      } catch {}
    } else if (paneCount === 6) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } else if (paneCount <= 9) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } else if (paneCount <= 12) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } else if (paneCount <= 16) {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    } else {
      execSync('tmux select-layout tiled', { stdio: 'pipe' });
    }

    execSync('tmux refresh-client', { stdio: 'pipe' });
  } catch (error) {
    try {
      execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
    } catch {}
  }
};
