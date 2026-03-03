import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';
import { getUntrackedPanes, createShellPane, getNextDmuxId } from '../utils/shellPaneDetection.js';
import { LogService } from '../services/LogService.js';

/**
 * Detects untracked panes (manually created via tmux commands)
 * and creates shell pane objects for them
 */
export async function detectAndAddShellPanes(
  panesFile: string,
  activePanes: DmuxPane[],
  allPaneIds: string[]
): Promise<{ updatedPanes: DmuxPane[]; shellPanesAdded: boolean }> {
  // Only detect if we have pane IDs from tmux
  if (allPaneIds.length === 0) {
    return { updatedPanes: activePanes, shellPanesAdded: false };
  }

  try {
    // Get controlPaneId and welcomePaneId from config
    let controlPaneId: string | undefined;
    let welcomePaneId: string | undefined;

    // Collect all control pane IDs to exclude (main + multi-window sidebars)
    let extraExcludePaneIds: string[] | undefined;

    try {
      const configContent = await fs.readFile(panesFile, 'utf-8');
      const config = JSON.parse(configContent);
      controlPaneId = config.controlPaneId;
      welcomePaneId = config.welcomePaneId;

      // Exclude control panes from all windows
      if (config.windows && Array.isArray(config.windows)) {
        extraExcludePaneIds = config.windows
          .map((w: any) => w.controlPaneId)
          .filter((id: string) => id && id !== controlPaneId);
      }
    } catch (error) {
      // Config not available (expected on first run), continue without filtering
    }

    const trackedPaneIds = activePanes.map(p => p.paneId);

    const sessionName = ''; // Empty string will make tmux use current session
    const untrackedPanes = await getUntrackedPanes(sessionName, trackedPaneIds, controlPaneId, welcomePaneId, extraExcludePaneIds);

    if (untrackedPanes.length === 0) {
      return { updatedPanes: activePanes, shellPanesAdded: false };
    }

  //     LogService.getInstance().debug(
  //       `Found ${untrackedPanes.length} untracked panes: ${untrackedPanes.map(p => p.paneId).join(', ')}`,
  //       'shellDetection'
  //     );

    // Create shell pane objects for each untracked pane
    const newShellPanes: DmuxPane[] = [];
    let nextId = getNextDmuxId(activePanes);

    for (const paneInfo of untrackedPanes) {
      const shellPane = await createShellPane(paneInfo.paneId, nextId, paneInfo.title);
      newShellPanes.push(shellPane);
      nextId++;
    }

    // Add new shell panes to active panes
    const updatedPanes = [...activePanes, ...newShellPanes];

  //     LogService.getInstance().debug(
  //       `Added ${newShellPanes.length} shell panes to tracking`,
  //       'shellDetection'
  //     );

    return { updatedPanes, shellPanesAdded: true };
  } catch (error) {
  //     LogService.getInstance().debug(
  //       'Failed to detect untracked panes',
  //       'shellDetection'
  //     );
    return { updatedPanes: activePanes, shellPanesAdded: false };
  }
}
