/**
 * Pane Polling Worker
 *
 * Runs in a separate thread to poll for pane changes without blocking the main UI.
 * This is the fallback when tmux hooks are not installed.
 *
 * The worker:
 * - Polls tmux for pane list at configurable intervals
 * - Detects added/removed panes by comparing snapshots
 * - Posts messages to main thread when changes detected
 */

import { parentPort, workerData } from 'worker_threads';
import { execSync } from 'child_process';

interface WorkerConfig {
  sessionName: string;
  controlPaneId?: string;
  pollInterval: number; // milliseconds
}

interface PaneSnapshot {
  paneIds: string[];
  timestamp: number;
}

// Get config from main thread
const config: WorkerConfig = workerData || {
  sessionName: '',
  pollInterval: 5000,
};

let lastSnapshot: PaneSnapshot | null = null;
let isRunning = true;

/**
 * Get current pane IDs from tmux
 */
function getPaneIds(): string[] {
  try {
    const output = execSync('tmux list-panes -F "#{pane_id}"', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 2000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Compare two snapshots and detect changes
 */
function detectChanges(oldSnapshot: PaneSnapshot | null, newSnapshot: PaneSnapshot): {
  added: string[];
  removed: string[];
  changed: boolean;
} {
  if (!oldSnapshot) {
    return { added: [], removed: [], changed: false };
  }

  const oldSet = new Set(oldSnapshot.paneIds);
  const newSet = new Set(newSnapshot.paneIds);

  const added = newSnapshot.paneIds.filter(id => !oldSet.has(id));
  const removed = oldSnapshot.paneIds.filter(id => !newSet.has(id));
  const changed = added.length > 0 || removed.length > 0;

  return { added, removed, changed };
}

/**
 * Main polling loop
 */
async function poll(): Promise<void> {
  while (isRunning) {
    try {
      const paneIds = getPaneIds();
      const newSnapshot: PaneSnapshot = {
        paneIds,
        timestamp: Date.now(),
      };

      const changes = detectChanges(lastSnapshot, newSnapshot);

      if (changes.changed) {
        // Post change event to main thread
        parentPort?.postMessage({
          type: 'panes-changed',
          added: changes.added,
          removed: changes.removed,
          paneIds: paneIds,
          timestamp: newSnapshot.timestamp,
        });
      }

      lastSnapshot = newSnapshot;

    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // Wait for next poll interval
    await new Promise(resolve => setTimeout(resolve, config.pollInterval));
  }
}

// Handle messages from main thread
parentPort?.on('message', (message: { type: string; pollInterval?: number }) => {
  switch (message.type) {
    case 'stop':
      isRunning = false;
      parentPort?.postMessage({ type: 'stopped' });
      break;

    case 'set-interval':
      if (message.pollInterval && message.pollInterval > 0) {
        config.pollInterval = message.pollInterval;
        parentPort?.postMessage({
          type: 'interval-updated',
          pollInterval: config.pollInterval,
        });
      }
      break;

    case 'force-poll':
      // Force an immediate poll
      const paneIds = getPaneIds();
      parentPort?.postMessage({
        type: 'panes-changed',
        added: [],
        removed: [],
        paneIds,
        timestamp: Date.now(),
        forced: true,
      });
      break;
  }
});

// Start polling
parentPort?.postMessage({ type: 'started', pollInterval: config.pollInterval });
poll().catch(error => {
  parentPort?.postMessage({
    type: 'fatal-error',
    message: error instanceof Error ? error.message : String(error),
  });
});
