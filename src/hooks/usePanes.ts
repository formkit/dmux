import { useEffect, useState } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import type { DmuxPane } from '../types.js';

export default function usePanes(panesFile: string, skipLoading: boolean) {
  const [panes, setPanes] = useState<DmuxPane[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPanes = async () => {
    if (skipLoading) return;

    try {
      const content = await fs.readFile(panesFile, 'utf-8');
      const loadedPanes = JSON.parse(content) as DmuxPane[];

      let allPaneIds: string[] = [];
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const output = execSync(`tmux list-panes -s -F '#{pane_id}'`, { 
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000
          });
          allPaneIds = output.trim().split('\n').filter(id => id && id.startsWith('%'));
          if (allPaneIds.length > 0 || retryCount === maxRetries) break;
        } catch {
          if (retryCount < maxRetries) await new Promise(r => setTimeout(r, 100));
        }
        retryCount++;
      }

      // Only filter panes if we successfully got the pane list
      // If tmux command failed (allPaneIds is empty), keep existing state
      const activePanes = allPaneIds.length > 0 
        ? loadedPanes.filter(pane => allPaneIds.includes(pane.paneId))
        : panes.length > 0 ? panes : loadedPanes;

      const currentPaneIds = panes.map(p => p.paneId).sort().join(',');
      const newPaneIds = activePanes.map(p => p.paneId).sort().join(',');

      if (currentPaneIds !== newPaneIds || panes.length === 0) {
        if (activePanes.length > 0) {
          activePanes.forEach(pane => {
            try {
              execSync(`tmux select-pane -t '${pane.paneId}' -T "${pane.slug}"`, { stdio: 'pipe' });
            } catch {}
          });
        }
        setPanes(activePanes);
        if (activePanes.length !== loadedPanes.length) {
          await fs.writeFile(panesFile, JSON.stringify(activePanes, null, 2));
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
      const paneIds = execSync(`tmux list-panes -s -F '#{pane_id}'`, { 
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 1000
      }).trim().split('\n').filter(id => id && id.startsWith('%'));
      activePanes = newPanes.filter(p => paneIds.includes(p.paneId));
    } catch {
      activePanes = newPanes;
    }

    await fs.writeFile(panesFile, JSON.stringify(activePanes, null, 2));
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
