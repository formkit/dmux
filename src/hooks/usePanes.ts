import { useEffect, useState, useRef } from 'react';
import PQueue from 'p-queue';
import type { DmuxPane } from '../types.js';
import { LogService } from '../services/LogService.js';
import { PANE_POLLING_INTERVAL } from '../constants/timing.js';
import {
  loadAndProcessPanes,
  recreateKilledWorktreePanes,
  fetchTmuxPaneIds,
} from './usePaneLoading.js';
import {
  enforcePaneTitles,
  savePanesToFile,
  rebindAndFilterPanes,
  saveUpdatedPaneConfig,
  handleLastPaneRemoval,
  destroyWelcomePaneIfNeeded,
} from './usePaneSync.js';
import {
  detectAndAddShellPanes,
} from './useShellDetection.js';
import { rebindPaneByTitle } from '../utils/paneRebinding.js';

// Use p-queue for proper concurrency control instead of manual write lock
// This prevents race conditions and provides better visibility into queue state
const configQueue = new PQueue({ concurrency: 1 });

async function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  return configQueue.add(operation);
}

export default function usePanes(panesFile: string, skipLoading: boolean) {
  const [panes, setPanes] = useState<DmuxPane[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadComplete = useRef(false);
  const isLoadingPanes = useRef(false); // Guard against concurrent loadPanes calls

  const loadPanes = async () => {
    if (skipLoading) return;

    // Prevent concurrent loadPanes calls which can cause race conditions
    // and duplicate pane detection
    if (isLoadingPanes.current) {
      return;
    }
    isLoadingPanes.current = true;

    try {
      // Load panes from file and rebind IDs based on tmux state
      const { panes: loadedPanes, allPaneIds, titleToId } = await loadAndProcessPanes(
        panesFile,
        !initialLoadComplete.current
      );

      // For initial load, set the loaded panes and mark as complete
      if (!initialLoadComplete.current) {
        // LogService.getInstance().debug(
        //   `Initial load: panes.length=${panes.length}, loadedPanes.length=${loadedPanes.length}`,
        //   'shellDetection'
        // );
        setPanes(loadedPanes);
        initialLoadComplete.current = true;
        return; // Exit early for initial load
      }

      // Rebind and filter panes (removes dead shell panes, keeps worktree panes)
      const { activePanes, shellPanesRemoved, worktreePanesToRecreate } = rebindAndFilterPanes(
        loadedPanes,
        titleToId,
        allPaneIds,
        !initialLoadComplete.current
      );

      // Recreate worktree panes that were killed (e.g., via Ctrl+b x)
      let finalPanes = activePanes;
      if (worktreePanesToRecreate.length > 0) {
        finalPanes = await recreateKilledWorktreePanes(activePanes, allPaneIds, panesFile);

        // Re-fetch pane IDs after recreation
        const freshData = await fetchTmuxPaneIds();
        const updatedIds = freshData.allPaneIds;
        const updatedTitleToId = freshData.titleToId;

        // Re-rebind after recreation using the utility function
        finalPanes = finalPanes.map(p => rebindPaneByTitle(p, updatedTitleToId, updatedIds));
      }

      // Detect untracked panes (only after initial load)
      let shellPanesAdded = false;
      if (initialLoadComplete.current) {
        // LogService.getInstance().debug(
        //   `Shell detection check: allPaneIds=${allPaneIds.length}, initialLoadComplete=${initialLoadComplete.current}`,
        //   'shellDetection'
        // );

        const { updatedPanes, shellPanesAdded: added } = await detectAndAddShellPanes(
          panesFile,
          finalPanes,
          allPaneIds
        );
        finalPanes = updatedPanes;
        shellPanesAdded = added;
      }

      // Destroy welcome pane if transitioning from 0 to >0 panes
      await destroyWelcomePaneIfNeeded(panesFile, panes.length, finalPanes.length);

      // Enforce pane titles always match slug (worktree name)
      await enforcePaneTitles(finalPanes, allPaneIds);

      // Check if panes changed (compare IDs and paneIds only)
      const currentPaneIds = panes.map(p => `${p.id}:${p.paneId}`).sort().join(',');
      const newPaneIds = finalPanes.map(p => `${p.id}:${p.paneId}`).sort().join(',');

      // Check if IDs were remapped
      const idsChanged = finalPanes.some((pane, idx) =>
        loadedPanes[idx] && loadedPanes[idx].paneId !== pane.paneId
      );

      // Update state and save if panes changed OR if shell panes were added/removed
      if (currentPaneIds !== newPaneIds || shellPanesAdded || shellPanesRemoved) {
        setPanes(finalPanes);

        // Save to file if IDs were remapped OR if shell panes were added/removed
        if (idsChanged || shellPanesAdded || shellPanesRemoved) {
          // LogService.getInstance().debug(
          //   `Saving config: idsChanged=${idsChanged}, shellPanesAdded=${shellPanesAdded}, shellPanesRemoved=${shellPanesRemoved}, finalPanes=${finalPanes.length}`,
          //   'shellDetection'
          // );
          await saveUpdatedPaneConfig(panesFile, finalPanes, withWriteLock);

          // If shell panes were removed and we now have 0 panes, recreate welcome pane
          if (shellPanesRemoved && finalPanes.length === 0) {
            await handleLastPaneRemoval(process.cwd());
          }
        } else {
          // LogService.getInstance().debug(
          //   `NOT saving: idsChanged=${idsChanged}, shellPanesAdded=${shellPanesAdded}, shellPanesRemoved=${shellPanesRemoved}`,
          //   'shellDetection'
          // );
        }
      }
    } catch (error) {
      // Silently ignore errors during pane loading to prevent UI crashes
      // Most common errors are transient tmux state issues that resolve on next poll
      LogService.getInstance().debug(
        `Error loading panes: ${error instanceof Error ? error.message : String(error)}`,
        'usePanes'
      );
    } finally {
      isLoadingPanes.current = false;
      if (isLoading) setIsLoading(false);
    }
  };

  const savePanes = async (newPanes: DmuxPane[]) => {
    const updatedPanes = await savePanesToFile(panesFile, newPanes, withWriteLock);
    setPanes(updatedPanes);
  };

  useEffect(() => {
    loadPanes();

    // Listen for pane split events from SIGUSR2 signal
    const handlePaneSplit = () => {
      LogService.getInstance().debug('Pane split event received, triggering immediate detection', 'shellDetection');
      if (!skipLoading) {
        loadPanes();
      }
    };
    process.on('pane-split-detected' as any, handlePaneSplit);

    // Re-enabled: polling helps correct any layout shifts by triggering re-renders
    const interval = setInterval(() => {
      if (!skipLoading) loadPanes();
    }, PANE_POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
      process.off('pane-split-detected' as any, handlePaneSplit);
    };
  }, [skipLoading, panesFile]);

  return { panes, setPanes, isLoading, loadPanes, savePanes } as const;
}
