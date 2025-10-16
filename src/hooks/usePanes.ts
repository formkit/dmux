import { useEffect, useState, useRef } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';
import { getUntrackedPanes, createShellPane, getNextDmuxId } from '../utils/shellPaneDetection.js';
import { LogService } from '../services/LogService.js';

// Separate config structure to match new format
interface DmuxConfig {
  projectName?: string;
  projectRoot?: string;
  panes: DmuxPane[];
  settings?: any;
  lastUpdated?: string;
}

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
      const content = await fs.readFile(panesFile, 'utf-8');
      // Handle both old array format and new config format
      let loadedPanes: DmuxPane[];
      let parsed: any = JSON.parse(content);
      if (Array.isArray(parsed)) {
        loadedPanes = parsed as DmuxPane[];
      } else {
        const config = parsed as DmuxConfig;
        loadedPanes = config.panes || [];
      }

      let allPaneIds: string[] = [];
      let titleToId = new Map<string, string>();
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const output = execSync(`tmux list-panes -s -F '#{pane_id}::#{pane_title}'`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000
          }).trim();
          if (output) {
            const lines = output.split('\n');
            for (const line of lines) {
              const [id, title] = line.split('::');
              // Filter out dmux internal panes (spacer, control pane, etc.)
              if (id && id.startsWith('%') && title !== 'dmux-spacer') {
                allPaneIds.push(id);
                if (title) titleToId.set(title.trim(), id);
              }
            }
          }
          if (allPaneIds.length > 0 || retryCount === maxRetries) break;
        } catch {
          if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 100));
        }
        retryCount++;
      }

      // Attempt to rebind panes whose IDs changed by matching on title (slug)
      const reboundPanes = loadedPanes.map(p => {
        if (allPaneIds.length > 0 && !allPaneIds.includes(p.paneId)) {
          const remappedId = titleToId.get(p.slug);
          if (remappedId) return { ...p, paneId: remappedId };
        }
        return p;
      });

      // Only attempt to recreate missing panes on initial load AND only if not already completed
      // Recreate worktree panes (type !== 'shell') that exist in config but not in tmux
      const missingPanes = (allPaneIds.length > 0 && loadedPanes.length > 0 && !initialLoadComplete.current)
        ? reboundPanes.filter(pane =>
            !allPaneIds.includes(pane.paneId) && pane.type !== 'shell'
          )
        : [];

      // Recreate missing panes (only on initial load)
      for (const missingPane of missingPanes) {
        try {
          // Create new pane
          const newPaneId = execSync(`tmux split-window -h -P -F '#{pane_id}' -c "${missingPane.worktreePath || process.cwd()}"`, {
            encoding: 'utf-8',
            stdio: 'pipe'
          }).trim();

          // Set pane title
          execSync(`tmux select-pane -t '${newPaneId}' -T "${missingPane.slug}"`, { stdio: 'pipe' });

          // Update the pane with new ID
          missingPane.paneId = newPaneId;

          // Send a message to the pane indicating it was restored
          // Use echo to properly display messages (avoid "command not found: #" errors)
          const slug = missingPane.slug.replace(/'/g, "'\\''");
          const promptPreview = (missingPane.prompt?.substring(0, 50) || '').replace(/'/g, "'\\''");
          execSync(`tmux send-keys -t '${newPaneId}' "echo '# Pane restored: ${slug}'" Enter`, { stdio: 'pipe' });
          execSync(`tmux send-keys -t '${newPaneId}' "echo '# Original prompt: ${promptPreview}...'" Enter`, { stdio: 'pipe' });
          execSync(`tmux send-keys -t '${newPaneId}' "cd ${missingPane.worktreePath || process.cwd()}" Enter`, { stdio: 'pipe' });
        } catch (error) {
          // If we can't create the pane, skip it
          // console.error(`Failed to recreate pane ${missingPane.slug}:`, error);
        }
      }

      // Re-fetch pane IDs after recreation
      if (missingPanes.length > 0) {
        // Apply even-horizontal layout after creating panes
        try {
          execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
          // Refresh to ensure panes are painted correctly after layout change
          execSync('tmux refresh-client', { stdio: 'pipe' });
        } catch {}

        allPaneIds = [];
        titleToId.clear();
        try {
          const output = execSync(`tmux list-panes -s -F '#{pane_id}::#{pane_title}'`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000
          }).trim();
          if (output) {
            const lines = output.split('\n');
            for (const line of lines) {
              const [id, title] = line.split('::');
              // Filter out dmux internal panes (spacer, control pane, etc.)
              if (id && id.startsWith('%') && title !== 'dmux-spacer') {
                allPaneIds.push(id);
                if (title) titleToId.set(title.trim(), id);
              }
            }
          }
        } catch {}

        // Re-rebind after recreation
        loadedPanes.forEach(p => {
          if (!allPaneIds.includes(p.paneId)) {
            const remappedId = titleToId.get(p.slug);
            if (remappedId) p.paneId = remappedId;
          }
        });
      }

      // Update pane IDs if they've changed (rebinding)
      // Filter out dead shell panes, but keep worktree panes (they can be recreated)
      LogService.getInstance().debug(
        `Checking panes: loaded=${loadedPanes.length}, allPaneIds=[${allPaneIds.join(', ')}]`,
        'shellDetection'
      );

      // Track worktree panes that need to be recreated
      const worktreePanesToRecreate: DmuxPane[] = [];

      let activePanes = loadedPanes
        .map(loadedPane => {
          // If we have tmux data and this pane's ID isn't found, try to rebind by title
          if (allPaneIds.length > 0 && !allPaneIds.includes(loadedPane.paneId)) {
            LogService.getInstance().debug(
              `Pane ${loadedPane.id} (${loadedPane.paneId}) not found in tmux, checking for rebind`,
              'shellDetection'
            );
            const remappedId = titleToId.get(loadedPane.slug);
            if (remappedId) {
              LogService.getInstance().debug(
                `Rebound pane ${loadedPane.id} from ${loadedPane.paneId} to ${remappedId}`,
                'shellDetection'
              );
              return { ...loadedPane, paneId: remappedId };
            }
          }
          return loadedPane;
        })
        .filter(pane => {
          // If we have tmux data and this pane is not found
          if (allPaneIds.length > 0 && !allPaneIds.includes(pane.paneId)) {
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
            // This handles the case where user kills pane with Ctrl+b x
            // (intentional closes via menu remove the pane from config entirely)
            if (initialLoadComplete.current && pane.worktreePath) {
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

      // Recreate worktree panes that were killed (e.g., via Ctrl+b x)
      if (worktreePanesToRecreate.length > 0) {
        LogService.getInstance().debug(
          `Recreating ${worktreePanesToRecreate.length} killed worktree panes`,
          'shellDetection'
        );

        for (const pane of worktreePanesToRecreate) {
          try {
            // Create new pane in the worktree directory
            const newPaneId = execSync(
              `tmux split-window -h -P -F '#{pane_id}' -c "${pane.worktreePath}"`,
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim();

            // Set pane title
            execSync(`tmux select-pane -t '${newPaneId}' -T "${pane.slug}"`, { stdio: 'pipe' });

            // Update the pane with new ID
            pane.paneId = newPaneId;

            // Send a message to the pane indicating it was restored
            const slug = pane.slug.replace(/'/g, "'\\''");
            const promptPreview = (pane.prompt?.substring(0, 50) || '').replace(/'/g, "'\\''");
            execSync(`tmux send-keys -t '${newPaneId}' "echo '# Pane restored: ${slug}'" Enter`, { stdio: 'pipe' });
            if (pane.prompt) {
              execSync(`tmux send-keys -t '${newPaneId}' "echo '# Original prompt: ${promptPreview}...'" Enter`, { stdio: 'pipe' });
            }
            execSync(`tmux send-keys -t '${newPaneId}' "cd ${pane.worktreePath}" Enter`, { stdio: 'pipe' });

            LogService.getInstance().debug(
              `Recreated worktree pane ${pane.id} (${pane.slug}) with new ID ${newPaneId}`,
              'shellDetection'
            );
          } catch (error) {
            LogService.getInstance().debug(
              `Failed to recreate worktree pane ${pane.id} (${pane.slug})`,
              'shellDetection'
            );
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

            const contentPaneIds = activePanes.map(p => p.paneId);
            recalculateAndApplyLayout(
              config.controlPaneId,
              contentPaneIds,
              dimensions.width,
              dimensions.height
            );

            LogService.getInstance().debug(
              `Recalculated layout after recreating worktree panes`,
              'shellDetection'
            );
          }
        } catch (error) {
          LogService.getInstance().debug(
            'Failed to recalculate layout after recreating worktree panes',
            'shellDetection'
          );
        }
      }

      // Detect untracked panes (manually created via tmux commands)
      // Only detect if we have pane IDs from tmux AND not on initial load
      let shellPanesAdded = false;
      LogService.getInstance().debug(
        `Shell detection check: allPaneIds=${allPaneIds.length}, initialLoadComplete=${initialLoadComplete.current}`,
        'shellDetection'
      );
      if (allPaneIds.length > 0 && initialLoadComplete.current) {
        try {
          // Get controlPaneId and welcomePaneId from config
          let controlPaneId: string | undefined;
          let welcomePaneId: string | undefined;

          try {
            const configContent = await fs.readFile(panesFile, 'utf-8');
            const config = JSON.parse(configContent);
            controlPaneId = config.controlPaneId;
            welcomePaneId = config.welcomePaneId;
          } catch {
            // Config not available, continue without filtering
          }

          const trackedPaneIds = activePanes.map(p => p.paneId);
          LogService.getInstance().debug(
            `Checking for untracked panes. Tracked: [${trackedPaneIds.join(', ')}], Control: ${controlPaneId}, Welcome: ${welcomePaneId}`,
            'shellDetection'
          );
          const sessionName = ''; // Empty string will make tmux use current session
          const untrackedPanes = getUntrackedPanes(sessionName, trackedPaneIds, controlPaneId, welcomePaneId);

          if (untrackedPanes.length > 0) {
            LogService.getInstance().debug(
              `Found ${untrackedPanes.length} untracked panes: ${untrackedPanes.map(p => p.paneId).join(', ')}`,
              'shellDetection'
            );

            // Create shell pane objects for each untracked pane
            const newShellPanes: DmuxPane[] = [];
            let nextId = getNextDmuxId(activePanes);

            for (const paneInfo of untrackedPanes) {
              const shellPane = createShellPane(paneInfo.paneId, nextId, paneInfo.title);
              newShellPanes.push(shellPane);
              nextId++;
            }

            // Add new shell panes to active panes
            activePanes = [...activePanes, ...newShellPanes];
            shellPanesAdded = true;

            LogService.getInstance().debug(
              `Added ${newShellPanes.length} shell panes to tracking`,
              'shellDetection'
            );
          }
        } catch (error) {
          LogService.getInstance().debug(
            'Failed to detect untracked panes',
            'shellDetection'
          );
        }
      }

      // For initial load, set the loaded panes and mark as complete
      if (!initialLoadComplete.current) {
        LogService.getInstance().debug(
          `Initial load: panes.length=${panes.length}, activePanes.length=${activePanes.length}`,
          'shellDetection'
        );
        // Initial load - set pane titles and update state (even if activePanes is empty)
        // NOTE: Title updates disabled to prevent UI shifts
        // activePanes.forEach(pane => {
        //   try {
        //     execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
        //   } catch {}
        // });
        setPanes(activePanes); // Always update state, even if empty
        initialLoadComplete.current = true;
        return; // Exit early for initial load
      }

      // For subsequent loads, check if any pane IDs were remapped
      const idsChanged = activePanes.some((pane, idx) =>
        loadedPanes[idx] && loadedPanes[idx].paneId !== pane.paneId
      );

      // Only update state if there's a meaningful change
      // Compare only IDs and paneIds, not agentStatus which changes separately
      const currentPaneIds = panes.map(p => `${p.id}:${p.paneId}`).sort().join(',');
      const newPaneIds = activePanes.map(p => `${p.id}:${p.paneId}`).sort().join(',');

      // Detect when we go from 0 panes to having panes - destroy welcome pane
      const shouldDestroyWelcome = panes.length === 0 && activePanes.length > 0;
      if (shouldDestroyWelcome) {
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
            destroyWelcomePane(config.welcomePaneId);
            // Clear welcomePaneId from config (will be saved below)
            config.welcomePaneId = undefined;
            // Write the config immediately to clear welcomePaneId
            await fs.writeFile(panesFile, JSON.stringify(config, null, 2));
          }
        } catch (error) {
          LogService.getInstance().debug('Failed to destroy welcome pane', 'shellDetection');
        }
      }

      // Update state and save if panes changed OR if shell panes were added/removed
      if (currentPaneIds !== newPaneIds || shellPanesAdded || shellPanesRemoved) {
        // Update pane titles in tmux
        // NOTE: Title updates disabled to prevent UI shifts during polling
        // activePanes.forEach(pane => {
        //   if (allPaneIds.includes(pane.paneId)) {
        //     try {
        //       execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
        //     } catch {}
        //   }
        // });

        setPanes(activePanes);

        // Save to file if IDs were remapped OR if shell panes were added/removed
        if (idsChanged || shellPanesAdded || shellPanesRemoved) {
          LogService.getInstance().debug(
            `Saving config: idsChanged=${idsChanged}, shellPanesAdded=${shellPanesAdded}, shellPanesRemoved=${shellPanesRemoved}, activePanes=${activePanes.length}`,
            'shellDetection'
          );
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

          // If shell panes were removed and we now have 0 panes, recreate welcome pane and recalculate layout
          if (shellPanesRemoved && activePanes.length === 0) {
            const { handleLastPaneRemoved } = await import('../utils/postPaneCleanup.js');
            await handleLastPaneRemoved(process.cwd());
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
    await withWriteLock(async () => {
      let activePanes = newPanes;

      // Try to update pane IDs if they've changed (rebinding)
      try {
        const out = execSync(`tmux list-panes -s -F '#{pane_id}::#{pane_title}'`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 1000
        }).trim();
        const titleToId = new Map<string, string>();
        if (out) {
          out.split('\n').forEach(line => {
            const [id, title] = line.split('::');
            // Filter out dmux internal panes (spacer, control pane, etc.)
            if (id && id.startsWith('%') && title && title !== 'dmux-spacer') {
              titleToId.set(title.trim(), id);
            }
          });
        }

        // Only rebind IDs, don't filter out panes
        // This prevents losing panes during concurrent operations
        activePanes = newPanes.map(p => {
          const remappedId = titleToId.get(p.slug);
          if (remappedId && remappedId !== p.paneId) {
            return { ...p, paneId: remappedId };
          }
          return p;
        });
      } catch {
        // If tmux command fails, keep panes as-is
        activePanes = newPanes;
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

      // Save in config format
      config.panes = activePanes;
      config.lastUpdated = new Date().toISOString();
      await fs.writeFile(panesFile, JSON.stringify(config, null, 2));
      setPanes(activePanes);
    });
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
    // Increased to 5 seconds to reduce frequency
    const interval = setInterval(() => {
      if (!skipLoading) loadPanes();
    }, 5000);

    return () => {
      clearInterval(interval);
      process.off('pane-split-detected' as any, handlePaneSplit);
    };
  }, [skipLoading, panesFile]);

  return { panes, setPanes, isLoading, loadPanes, savePanes } as const;
}
