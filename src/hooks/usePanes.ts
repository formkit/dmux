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

export default function usePanes(panesFile: string, skipLoading: boolean) {
  const [panes, setPanes] = useState<DmuxPane[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

      // Only filter panes if we successfully got the pane list
      // If tmux command failed (allPaneIds is empty), keep existing state
      const activePanes = allPaneIds.length > 0
        ? reboundPanes.filter(pane => allPaneIds.includes(pane.paneId))
        : panes; // Always preserve existing panes when tmux fails

      const currentPaneIds = panes.map(p => p.paneId).sort().join(',');
      const newPaneIds = activePanes.map(p => p.paneId).sort().join(',');

      // Only update if there's a real change, not just on initial load
      if (currentPaneIds !== newPaneIds && (panes.length > 0 || activePanes.length > 0)) {
        if (activePanes.length > 0) {
          activePanes.forEach(pane => {
            try {
              execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
            } catch {}
          });
        }
        setPanes(activePanes);
        // Persist updated list if IDs changed or panes were filtered
        if (JSON.stringify(activePanes) !== JSON.stringify(loadedPanes)) {
          // Save in new config format
          const config: DmuxConfig = {
            ...parsed,
            panes: activePanes,
            lastUpdated: new Date().toISOString()
          };
          await fs.writeFile(panesFile, JSON.stringify(config, null, 2));
        }
      }
    } catch {
      // ignore
    } finally {
      if (isLoading) setIsLoading(false);
    }
  };

  const savePanes = async (newPanes: DmuxPane[]) => {
    let activePanes = newPanes;
    try {
      const out = execSync(`tmux list-panes -s -F '#{pane_id}::#{pane_title}'`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 1000
      }).trim();
      const paneIds: string[] = [];
      const titleToId = new Map<string, string>();
      if (out) {
        out.split('\n').forEach(line => {
          const [id, title] = line.split('::');
          if (id && id.startsWith('%')) paneIds.push(id);
          if (title) titleToId.set(title.trim(), id);
        });
      }

      // Rebind panes by title if their IDs changed, then filter to existing panes when possible
      activePanes = newPanes
        .map(p => {
          if (!paneIds.includes(p.paneId)) {
            const remappedId = titleToId.get(p.slug);
            if (remappedId) return { ...p, paneId: remappedId };
          }
          return p;
        })
        .filter(p => paneIds.length > 0 ? paneIds.includes(p.paneId) : true);
    } catch {
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
