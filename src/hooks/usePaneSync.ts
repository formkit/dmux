import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';
import { rebindPaneByTitle } from '../utils/paneRebinding.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';
import { PaneLifecycleManager } from '../services/PaneLifecycleManager.js';
import { TMUX_COMMAND_TIMEOUT } from '../constants/timing.js';
import type { DmuxConfig } from './usePaneLoading.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';

/**
 * Enforces that pane titles in tmux match the slugs in the config
 * This ensures dmux config is the source of truth for pane names
 */
export async function enforcePaneTitles(
  panes: DmuxPane[],
  allPaneIds: string[]
): Promise<void> {
  const tmuxService = TmuxService.getInstance();

  for (const pane of panes) {
    if (allPaneIds.includes(pane.paneId)) {
      try {
        // Get current title to check if update is needed
        const currentTitle = await tmuxService.getPaneTitle(pane.paneId);

        // Only update if title doesn't match slug (avoids unnecessary tmux commands)
        if (currentTitle !== pane.slug) {
          await tmuxService.setPaneTitle(pane.paneId, pane.slug);
          LogService.getInstance().debug(
            `Synced pane title: ${pane.id} "${currentTitle}" → "${pane.slug}"`,
            'shellDetection'
          );
        }
      } catch (error) {
        // Ignore errors - pane might have been killed between check and sync
        LogService.getInstance().debug(
          `Failed to sync title for pane ${pane.id}: ${error instanceof Error ? error.message : String(error)}`,
          'usePaneSync'
        );
      }
    }
  }
}

/**
 * Saves panes to config file with rebinding and write lock protection
 * Used for explicit save operations (not periodic background saves)
 */
export async function savePanesToFile(
  panesFile: string,
  panes: DmuxPane[],
  withWriteLock: <T>(operation: () => Promise<T>) => Promise<T>
): Promise<DmuxPane[]> {
  return withWriteLock(async () => {
    let activePanes = panes;

    // Try to update pane IDs if they've changed (rebinding)
    try {
      const tmuxService = TmuxService.getInstance();
      const allPanes = await tmuxService.getAllPaneIds();
      const titleToId = new Map<string, string>();

      // Fetch titles for each pane
      for (const id of allPanes) {
        try {
          const title = await tmuxService.getPaneTitle(id);
          // Filter out dmux internal panes (spacer, control pane, etc.)
          if (id && id.startsWith('%') && title && title !== 'dmux-spacer') {
            titleToId.set(title.trim(), id);
          }
        } catch {
          // Skip panes we can't get titles for
          continue;
        }
      }

      // Only rebind IDs, don't filter out panes
      // This prevents losing panes during concurrent operations
      // Note: We need to get allPaneIds to properly use rebindPaneByTitle
      const allPaneIds = Array.from(titleToId.values());
      activePanes = panes.map(p => rebindPaneByTitle(p, titleToId, allPaneIds));
    } catch (error) {
      // If tmux command fails, keep panes as-is (prevents data loss during tmux instability)
      LogService.getInstance().debug(
        `Failed to fetch tmux panes for rebinding: ${error instanceof Error ? error.message : String(error)}`,
        'usePaneSync'
      );
      activePanes = panes;
    }

    // Read existing config to preserve other fields
    let config: DmuxConfig = { panes: [] };
    try {
      const content = await fs.readFile(panesFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        config = parsed;
      }
    } catch {}

    // Save in config format (use atomic write to prevent race conditions)
    config.panes = activePanes;
    config.lastUpdated = new Date().toISOString();
    await atomicWriteJson(panesFile, config);

    return activePanes;
  });
}

/**
 * Rebinds all panes and filters out dead shell panes
 * Keeps worktree panes even if not found (they can be recreated)
 *
 * IMPORTANT: Checks PaneLifecycleManager to avoid queuing panes for recreation
 * if they are being intentionally closed (prevents race condition)
 */
export function rebindAndFilterPanes(
  loadedPanes: DmuxPane[],
  titleToId: Map<string, string>,
  allPaneIds: string[],
  isInitialLoad: boolean
): { activePanes: DmuxPane[]; shellPanesRemoved: boolean; worktreePanesToRecreate: DmuxPane[] } {
  const worktreePanesToRecreate: DmuxPane[] = [];
  const lifecycleManager = PaneLifecycleManager.getInstance();

  // LogService.getInstance().debug(
  //   `Checking panes: loaded=${loadedPanes.length}, allPaneIds=[${allPaneIds.join(', ')}]`,
  //   'shellDetection'
  // );

  // Rebind panes based on title matching
  const reboundPanes = loadedPanes.map(loadedPane => {
    const rebound = rebindPaneByTitle(loadedPane, titleToId, allPaneIds);
    if (rebound.paneId !== loadedPane.paneId) {
      LogService.getInstance().debug(
        `Pane ${loadedPane.id} (${loadedPane.paneId}) not found in tmux, checking for rebind`,
        'shellDetection'
      );
    }
    return rebound;
  });

  // Filter out dead shell panes, keep worktree panes
  const activePanes = reboundPanes.filter(pane => {
    // If we have tmux data and this pane is not found
    if (allPaneIds.length > 0 && !allPaneIds.includes(pane.paneId)) {
      // CRITICAL: Check if pane is being intentionally closed
      // If so, remove it from tracking (don't recreate, don't keep)
      if (lifecycleManager.isClosing(pane.id) || lifecycleManager.isClosing(pane.paneId)) {
        LogService.getInstance().debug(
          `Pane ${pane.id} (${pane.slug}) is being intentionally closed - removing from list`,
          'shellDetection'
        );
        return false; // Remove from list entirely
      }

      LogService.getInstance().debug(
        `Pane ${pane.id} (${pane.paneId}) not in tmux. Type: ${pane.type}`,
        'shellDetection'
      );

      // Remove shell panes that are no longer present
      if (pane.type === 'shell') {
        LogService.getInstance().debug(
          `Removing dead shell pane: ${pane.id} (${pane.slug})`,
          'shellDetection'
        );
        return false;
      }

      // For worktree panes after initial load, queue them for recreation
      if (!isInitialLoad && pane.worktreePath) {
        LogService.getInstance().debug(
          `Worktree pane ${pane.id} (${pane.slug}) was killed, will recreate it`,
          'shellDetection'
        );
        worktreePanesToRecreate.push(pane);
        return true; // Keep it in the list
      }

      // Keep worktree panes (they can be recreated on restart)
      LogService.getInstance().debug(
        `Keeping worktree pane: ${pane.id} (will be recreated if needed)`,
        'shellDetection'
      );
    }
    return true;
  });

  // Track if shell panes were removed (for saving to config)
  const shellPanesRemoved = loadedPanes.some(p =>
    p.type === 'shell' && allPaneIds.length > 0 && !allPaneIds.includes(p.paneId)
  );

  if (shellPanesRemoved) {
    LogService.getInstance().debug(
      `Shell panes were removed, will save updated config`,
      'shellDetection'
    );
  }

  return { activePanes, shellPanesRemoved, worktreePanesToRecreate };
}

/**
 * Saves updated pane config to file (used during periodic polling)
 */
export async function saveUpdatedPaneConfig(
  panesFile: string,
  activePanes: DmuxPane[],
  withWriteLock: <T>(operation: () => Promise<T>) => Promise<T>
): Promise<void> {
  await withWriteLock(async () => {
    // Re-read config in case it changed
    let currentConfig: DmuxConfig = { panes: [] };
    try {
      const content = await fs.readFile(panesFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        currentConfig = parsed;
      }
    } catch {}

    // Update with remapped panes
    currentConfig.panes = activePanes;
    currentConfig.lastUpdated = new Date().toISOString();
    LogService.getInstance().debug(
      `Writing config with ${currentConfig.panes.length} panes`,
      'shellDetection'
    );
    await fs.writeFile(panesFile, JSON.stringify(currentConfig, null, 2));
    LogService.getInstance().debug('Config file written successfully', 'shellDetection');
  });
}

/**
 * Handles cleanup when the last pane is removed
 * Recreates welcome pane and recalculates layout
 */
export async function handleLastPaneRemoval(projectRoot: string): Promise<void> {
  const { handleLastPaneRemoved } = await import('../utils/postPaneCleanup.js');
  await handleLastPaneRemoved(projectRoot);
}

/**
 * Destroys welcome pane when panes are added
 */
export async function destroyWelcomePaneIfNeeded(
  panesFile: string,
  currentPaneCount: number,
  newPaneCount: number
): Promise<void> {
  const shouldDestroyWelcome = currentPaneCount === 0 && newPaneCount > 0;
  if (!shouldDestroyWelcome) return;

  try {
    // Load config to get welcomePaneId
    const configContent = await fs.readFile(panesFile, 'utf-8');
    const config = JSON.parse(configContent);
    if (config.welcomePaneId) {
      LogService.getInstance().debug(
        `Destroying welcome pane ${config.welcomePaneId} because panes were added`,
        'shellDetection'
      );
      const { destroyWelcomePane } = await import('../utils/welcomePane.js');
      await destroyWelcomePane(config.welcomePaneId);
      // Clear welcomePaneId from config (will be saved by caller)
      config.welcomePaneId = undefined;
      // Write the config immediately to clear welcomePaneId
      await fs.writeFile(panesFile, JSON.stringify(config, null, 2));
    }
  } catch (error) {
    LogService.getInstance().debug('Failed to destroy welcome pane', 'shellDetection');
  }
}
