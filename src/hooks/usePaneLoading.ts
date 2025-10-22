import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';
import { splitPane } from '../utils/tmux.js';
import { rebindPaneByTitle } from '../utils/paneRebinding.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';
import { TMUX_COMMAND_TIMEOUT, TMUX_RETRY_DELAY } from '../constants/timing.js';

// Separate config structure to match new format
export interface DmuxConfig {
  projectName?: string;
  projectRoot?: string;
  panes: DmuxPane[];
  settings?: any;
  lastUpdated?: string;
  controlPaneId?: string;
  welcomePaneId?: string;
}

interface PaneLoadResult {
  panes: DmuxPane[];
  allPaneIds: string[];
  titleToId: Map<string, string>;
}

/**
 * Fetches all tmux pane IDs and titles for the current session
 * Retries up to maxRetries times with delay between attempts
 */
export async function fetchTmuxPaneIds(maxRetries = 2): Promise<{ allPaneIds: string[]; titleToId: Map<string, string> }> {
  const tmuxService = TmuxService.getInstance();
  let allPaneIds: string[] = [];
  let titleToId = new Map<string, string>();
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      // Get all panes in session with their titles
      const allPanes = await tmuxService.getAllPaneIds();

      // Fetch titles for each pane
      for (const id of allPanes) {
        try {
          const title = await tmuxService.getPaneTitle(id);
          // Filter out dmux internal panes (spacer, control pane, etc.)
          if (id && id.startsWith('%') && title !== 'dmux-spacer') {
            allPaneIds.push(id);
            if (title) titleToId.set(title.trim(), id);
          }
        } catch {
          // Skip panes we can't get titles for
          continue;
        }
      }

      if (allPaneIds.length > 0 || retryCount === maxRetries) break;
    } catch (error) {
      // Retry on tmux command failure (common during rapid pane creation/destruction)
  //       LogService.getInstance().debug(
  //         `Tmux fetch failed (attempt ${retryCount + 1}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`,
  //         'usePaneLoading'
  //       );
      if (retryCount < maxRetries) await new Promise(r => setTimeout(r, TMUX_RETRY_DELAY));
    }
    retryCount++;
  }

  return { allPaneIds, titleToId };
}

/**
 * Reads and parses the panes config file
 * Handles both old array format and new config format
 */
export async function loadPanesFromFile(panesFile: string): Promise<DmuxPane[]> {
  try {
    const content = await fs.readFile(panesFile, 'utf-8');
    const parsed: any = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed as DmuxPane[];
    } else {
      const config = parsed as DmuxConfig;
      return config.panes || [];
    }
  } catch (error) {
    // Return empty array if config file doesn't exist or is invalid
    // This is expected on first run
  //     LogService.getInstance().debug(
  //       `Config file not found or invalid: ${error instanceof Error ? error.message : String(error)}`,
  //       'usePaneLoading'
  //     );
    return [];
  }
}

/**
 * Recreates missing worktree panes that exist in config but not in tmux
 * Only called on initial load
 */
export async function recreateMissingPanes(
  missingPanes: DmuxPane[],
  panesFile: string
): Promise<void> {
  if (missingPanes.length === 0) return;

  const tmuxService = TmuxService.getInstance();

  for (const missingPane of missingPanes) {
    try {
      // Create new pane
      const newPaneId = splitPane({ cwd: missingPane.worktreePath || process.cwd() });

      // Set pane title
      await tmuxService.setPaneTitle(newPaneId, missingPane.slug);

      // Update the pane with new ID
      missingPane.paneId = newPaneId;

      // Send a message to the pane indicating it was restored
      await tmuxService.sendKeys(newPaneId, `"echo '# Pane restored: ${missingPane.slug}'" Enter`);
      const promptPreview = missingPane.prompt?.substring(0, 50) || '';
      await tmuxService.sendKeys(newPaneId, `"echo '# Original prompt: ${promptPreview}...'" Enter`);
      await tmuxService.sendKeys(newPaneId, `"cd ${missingPane.worktreePath || process.cwd()}" Enter`);
    } catch (error) {
      // If we can't create the pane, skip it
    }
  }

  // Apply even-horizontal layout after creating panes
  try {
    await tmuxService.selectLayout('even-horizontal');
    await tmuxService.refreshClient();
  } catch {}
}

/**
 * Recreates worktree panes that were killed by the user (e.g., via Ctrl+b x)
 * Called during periodic polling after initial load
 */
export async function recreateKilledWorktreePanes(
  panes: DmuxPane[],
  allPaneIds: string[],
  panesFile: string
): Promise<DmuxPane[]> {
  const worktreePanesToRecreate = panes.filter(pane =>
    !allPaneIds.includes(pane.paneId) && pane.worktreePath
  );

  if (worktreePanesToRecreate.length === 0) return panes;

  const tmuxService = TmuxService.getInstance();

  //   LogService.getInstance().debug(
  //     `Recreating ${worktreePanesToRecreate.length} killed worktree panes`,
  //     'shellDetection'
  //   );

  const updatedPanes = [...panes];

  for (const pane of worktreePanesToRecreate) {
    try {
      // Create new pane in the worktree directory
      const newPaneId = splitPane({ cwd: pane.worktreePath });

      // Set pane title
      await tmuxService.setPaneTitle(newPaneId, pane.slug);

      // Update the pane with new ID
      const paneIndex = updatedPanes.findIndex(p => p.id === pane.id);
      if (paneIndex !== -1) {
        updatedPanes[paneIndex] = { ...pane, paneId: newPaneId };
      }

      // Send a message to the pane indicating it was restored
      await tmuxService.sendKeys(newPaneId, `"echo '# Pane restored: ${pane.slug}'" Enter`);
      if (pane.prompt) {
        const promptPreview = pane.prompt.substring(0, 50) || '';
        await tmuxService.sendKeys(newPaneId, `"echo '# Original prompt: ${promptPreview}...'" Enter`);
      }
      await tmuxService.sendKeys(newPaneId, `"cd ${pane.worktreePath}" Enter`);

  //       LogService.getInstance().debug(
  //         `Recreated worktree pane ${pane.id} (${pane.slug}) with new ID ${newPaneId}`,
  //         'shellDetection'
  //       );
    } catch (error) {
  //       LogService.getInstance().debug(
  //         `Failed to recreate worktree pane ${pane.id} (${pane.slug})`,
  //         'shellDetection'
  //       );
    }
  }

  // Recalculate layout after recreating panes
  try {
    const configContent = await fs.readFile(panesFile, 'utf-8');
    const config = JSON.parse(configContent);
    if (config.controlPaneId) {
      const { recalculateAndApplyLayout } = await import('../utils/layoutManager.js');
      const { getTerminalDimensions } = await import('../utils/tmux.js');
      const dimensions = getTerminalDimensions();

      const contentPaneIds = updatedPanes.map(p => p.paneId);
      recalculateAndApplyLayout(
        config.controlPaneId,
        contentPaneIds,
        dimensions.width,
        dimensions.height
      );

  //       LogService.getInstance().debug(
  //         `Recalculated layout after recreating worktree panes`,
  //         'shellDetection'
  //       );
    }
  } catch (error) {
  //     LogService.getInstance().debug(
  //       'Failed to recalculate layout after recreating worktree panes',
  //       'shellDetection'
  //     );
  }

  return updatedPanes;
}

/**
 * Loads panes from config file, rebinds IDs, and recreates missing panes
 * Returns the loaded and processed panes along with tmux state
 */
export async function loadAndProcessPanes(
  panesFile: string,
  isInitialLoad: boolean
): Promise<PaneLoadResult> {
  const loadedPanes = await loadPanesFromFile(panesFile);
  let { allPaneIds, titleToId } = await fetchTmuxPaneIds();

  // Attempt to rebind panes whose IDs changed by matching on title (slug)
  const reboundPanes = loadedPanes.map(p => rebindPaneByTitle(p, titleToId, allPaneIds));

  // Only attempt to recreate missing panes on initial load
  const missingPanes = (allPaneIds.length > 0 && loadedPanes.length > 0 && isInitialLoad)
    ? reboundPanes.filter(pane =>
        !allPaneIds.includes(pane.paneId) && pane.type !== 'shell'
      )
    : [];

  // Recreate missing panes (only on initial load)
  await recreateMissingPanes(missingPanes, panesFile);

  // Re-fetch pane IDs after recreation
  if (missingPanes.length > 0) {
    const freshData = await fetchTmuxPaneIds();
    allPaneIds = freshData.allPaneIds;
    titleToId = freshData.titleToId;

    // Re-rebind after recreation
    loadedPanes.forEach((p, idx) => {
      const rebound = rebindPaneByTitle(p, titleToId, allPaneIds);
      if (rebound.paneId !== p.paneId) {
        loadedPanes[idx] = rebound;
      }
    });
  }

  return { panes: reboundPanes, allPaneIds, titleToId };
}
