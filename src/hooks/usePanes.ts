import { useEffect, useState, useRef } from 'react';
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

// Simple write lock to prevent concurrent config writes
let isWriting = false;
const writeQueue: (() => Promise<void>)[] = [];

async function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (isWriting) {
    // Queue this operation
    return new Promise((resolve, reject) => {
      writeQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result as any);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  isWriting = true;
  try {
    const result = await operation();
    // Process any queued operations
    while (writeQueue.length > 0) {
      const nextOp = writeQueue.shift();
      if (nextOp) await nextOp();
    }
    return result;
  } finally {
    isWriting = false;
  }
}

export default function usePanes(panesFile: string, skipLoading: boolean) {
  const [panes, setPanes] = useState<DmuxPane[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadComplete = useRef(false);

  const loadPanes = async () => {
    if (skipLoading) return;

    try {
      // Load panes from file and rebind IDs based on tmux state
      const { panes: loadedPanes, allPaneIds, titleToId } = await loadAndProcessPanes(
        panesFile,
        !initialLoadComplete.current
      );

      // For initial load, set the loaded panes and mark as complete
      if (!initialLoadComplete.current) {
        LogService.getInstance().debug(
          `Initial load: panes.length=${panes.length}, loadedPanes.length=${loadedPanes.length}`,
          'shellDetection'
        );
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

        // Re-rebind after recreation
        finalPanes = finalPanes.map(p => {
          const titleMatch = updatedTitleToId.get(p.slug);
          if (titleMatch && titleMatch !== p.paneId) {
            return { ...p, paneId: titleMatch };
          }
          return p;
        });
      }

      // Detect untracked panes (only after initial load)
      let shellPanesAdded = false;
      if (initialLoadComplete.current) {
        LogService.getInstance().debug(
          `Shell detection check: allPaneIds=${allPaneIds.length}, initialLoadComplete=${initialLoadComplete.current}`,
          'shellDetection'
        );

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
          LogService.getInstance().debug(
            `Saving config: idsChanged=${idsChanged}, shellPanesAdded=${shellPanesAdded}, shellPanesRemoved=${shellPanesRemoved}, finalPanes=${finalPanes.length}`,
            'shellDetection'
          );
          await saveUpdatedPaneConfig(panesFile, finalPanes, withWriteLock);

          // If shell panes were removed and we now have 0 panes, recreate welcome pane
          if (shellPanesRemoved && finalPanes.length === 0) {
            await handleLastPaneRemoval(process.cwd());
          }
        } else {
          LogService.getInstance().debug(
            `NOT saving: idsChanged=${idsChanged}, shellPanesAdded=${shellPanesAdded}, shellPanesRemoved=${shellPanesRemoved}`,
            'shellDetection'
          );
        }
      }
    } catch {
      // ignore
    } finally {
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
