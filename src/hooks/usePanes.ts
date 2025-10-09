import { useEffect, useState } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';

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
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

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
              if (id && id.startsWith('%')) {
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
      // Check loadedPanes.length (from file) instead of panes.length (React state)
      // This prevents recreation when panes are intentionally closed (e.g., after merge)
      const missingPanes = (allPaneIds.length > 0 && loadedPanes.length > 0 && panes.length === 0 && !initialLoadComplete)
        ? reboundPanes.filter(pane => !allPaneIds.includes(pane.paneId))
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
          execSync(`tmux send-keys -t '${newPaneId}' "# Pane restored: ${missingPane.slug}" Enter`, { stdio: 'pipe' });
          execSync(`tmux send-keys -t '${newPaneId}' "# Original prompt: ${missingPane.prompt?.substring(0, 50)}..." Enter`, { stdio: 'pipe' });
          execSync(`tmux send-keys -t '${newPaneId}' "cd ${missingPane.worktreePath || process.cwd()}" Enter`, { stdio: 'pipe' });
        } catch (error) {
          // If we can't create the pane, skip it
          console.error(`Failed to recreate pane ${missingPane.slug}:`, error);
        }
      }

      // Re-fetch pane IDs after recreation
      if (missingPanes.length > 0) {
        // Apply even-horizontal layout after creating panes
        try {
          execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
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
              if (id && id.startsWith('%')) {
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

      // Update pane IDs if they've changed (rebinding), but DON'T filter out panes
      // This prevents race conditions where panes get removed from config
      const activePanes = loadedPanes.map(loadedPane => {
        // If we have tmux data and this pane's ID isn't found, try to rebind by title
        if (allPaneIds.length > 0 && !allPaneIds.includes(loadedPane.paneId)) {
          const remappedId = titleToId.get(loadedPane.slug);
          if (remappedId) {
            return { ...loadedPane, paneId: remappedId };
          }
        }
        return loadedPane;
      });

      // For initial load (when panes is empty AND we haven't loaded before), set the loaded panes
      if (panes.length === 0 && activePanes.length > 0 && !initialLoadComplete) {
        // Initial load - set pane titles and update state
        activePanes.forEach(pane => {
          try {
            execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
          } catch {}
        });
        setPanes(activePanes);
        setInitialLoadComplete(true);
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

      if (currentPaneIds !== newPaneIds) {
        // Update pane titles in tmux
        activePanes.forEach(pane => {
          if (allPaneIds.includes(pane.paneId)) {
            try {
              execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
            } catch {}
          }
        });

        setPanes(activePanes);

        // Only save to file if IDs were remapped (not just reordered)
        if (idsChanged) {
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
            await fs.writeFile(panesFile, JSON.stringify(currentConfig, null, 2));
          });
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
            if (id && id.startsWith('%') && title) {
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
    const interval = setInterval(() => {
      if (!skipLoading) loadPanes();
    }, 3000);
    return () => clearInterval(interval);
  }, [skipLoading, panesFile]);

  return { panes, setPanes, isLoading, loadPanes, savePanes } as const;
}
