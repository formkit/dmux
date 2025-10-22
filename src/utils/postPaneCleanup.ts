/**
 * Shared utility for post-pane cleanup operations
 * Handles welcome pane recreation and layout recalculation when last pane is removed
 */

import fs from 'fs/promises';
import path from 'path';
import type { DmuxConfig } from '../types.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';

/**
 * Recreate welcome pane and recalculate layout after the last pane is removed
 * This should be called whenever panes.length transitions from >0 to 0
 *
 * @param projectRoot - The project root directory
 */
export async function handleLastPaneRemoved(projectRoot: string): Promise<void> {
  const tmuxService = TmuxService.getInstance();

  try {
    // Get the ACTUAL current control pane ID from tmux (don't trust config)
    let controlPaneId: string;
    try {
      const { execSync } = await import('child_process');
      controlPaneId = execSync('tmux display-message -p "#{pane_id}"', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
    } catch (error) {
      LogService.getInstance().debug('Failed to get current pane ID from tmux', 'postPaneCleanup');
      return;
    }

    if (!controlPaneId) {
      LogService.getInstance().debug('No controlPaneId from tmux, skipping welcome pane recreation', 'postPaneCleanup');
      return;
    }

    LogService.getInstance().debug(
      `Last pane removed, recreating welcome pane and recalculating layout (controlPaneId: ${controlPaneId})`,
      'postPaneCleanup'
    );

    // Recreate welcome pane
    const { createWelcomePaneCoordinated } = await import('./welcomePaneManager.js');
    const created = await createWelcomePaneCoordinated(projectRoot, controlPaneId);

    if (created) {
      LogService.getInstance().debug('Recreated welcome pane after last pane removed', 'postPaneCleanup');
    } else {
      LogService.getInstance().debug('Failed to recreate welcome pane', 'postPaneCleanup');
    }

    // Recalculate layout to fix sidebar size
    const { recalculateAndApplyLayout } = await import('./layoutManager.js');
    const dimensions = await tmuxService.getTerminalDimensions();

    recalculateAndApplyLayout(
      controlPaneId,
      [], // No content panes
      dimensions.width,
      dimensions.height
    );

    LogService.getInstance().debug('Recalculated layout after last pane removed', 'postPaneCleanup');
  } catch (error) {
    LogService.getInstance().error(
      'Failed to handle last pane removal',
      'postPaneCleanup',
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}
