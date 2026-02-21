import fs from 'fs';
import path from 'path';
import type { DmuxConfig } from '../types.js';
import { createWelcomePane, welcomePaneExists, destroyWelcomePane } from './welcomePane.js';
import { LogService } from '../services/LogService.js';
import { atomicWriteJsonSync } from './atomicWrite.js';

// Global lock to prevent concurrent welcome pane operations
let creationLock = false;
let lastCreationTime = 0;
const CREATION_DEBOUNCE_MS = 500; // Wait 500ms after creation before allowing another

/**
 * Try to acquire the creation lock (for creating welcome panes)
 * This has a debounce to prevent duplicate creations
 */
function tryAcquireCreationLock(): boolean {
  const now = Date.now();

  // Check if we're within the debounce window
  if (now - lastCreationTime < CREATION_DEBOUNCE_MS) {
    return false;
  }

  // Check if lock is already held
  if (creationLock) {
    return false;
  }

  creationLock = true;
  return true;
}

/**
 * Release the creation lock
 */
function releaseCreationLock(): void {
  creationLock = false;
  lastCreationTime = Date.now();
}

/**
 * Destroy the welcome pane if it exists
 * This should be called when creating the first content pane
 * NO LOCK - destruction is always allowed and takes priority
 *
 * @param projectRoot - The project root directory
 * @returns true if destroyed successfully or no pane to destroy
 */
export function destroyWelcomePaneCoordinated(projectRoot: string): boolean {
  const logService = LogService.getInstance();

  try {
    const configPath = path.join(projectRoot, '.dmux', 'dmux.config.json');

    if (!fs.existsSync(configPath)) {
      return true; // No config, nothing to destroy
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: DmuxConfig = JSON.parse(configContent);

    if (config.welcomePaneId) {
      // Destroy the pane
      destroyWelcomePane(config.welcomePaneId);

      // Clear from config (use atomic write to prevent race conditions)
      delete config.welcomePaneId;
      config.lastUpdated = new Date().toISOString();
      atomicWriteJsonSync(configPath, config);

      // DO NOT recalculate layout here - layout was already calculated in paneCreation.ts
      // before this function was called. Recalculating now would cause a mismatch because
      // tmux still has 3 panes (sidebar, welcome being destroyed, new content) but we'd
      // calculate for 2 panes (sidebar, new content).
      // The layout application in paneCreation.ts already accounts for the correct final state.
    }

    return true;
  } catch (error) {
    logService.error('Failed to destroy welcome pane', 'WelcomePaneManager', undefined, error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Create a welcome pane (coordinated with creation lock)
 * This should be called when closing the last content pane
 * Uses a debounced lock to prevent duplicate creations
 *
 * @param projectRoot - The project root directory
 * @param controlPaneId - The control pane ID
 * @returns true if created successfully, false if locked or failed
 */
export async function createWelcomePaneCoordinated(
  projectRoot: string,
  controlPaneId: string
): Promise<boolean> {
  const logService = LogService.getInstance();

  // Try to acquire creation lock
  if (!tryAcquireCreationLock()) {
    logService.debug('Could not acquire creation lock (debounce active)', 'WelcomePaneManager');
    return false;
  }

  try {
    const configPath = path.join(projectRoot, '.dmux', 'dmux.config.json');

    if (!fs.existsSync(configPath)) {
      logService.debug('Config file not found', 'WelcomePaneManager');
      return false;
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: DmuxConfig = JSON.parse(configContent);

    // Check if we already have a valid welcome pane
    if (config.welcomePaneId && await welcomePaneExists(config.welcomePaneId)) {
      return true; // Already exists, that's fine
    }

    // Create the welcome pane
    const welcomePaneId = await createWelcomePane(controlPaneId, projectRoot);

    if (welcomePaneId) {
      // Update config with new welcome pane ID (use atomic write)
      config.welcomePaneId = welcomePaneId;
      config.lastUpdated = new Date().toISOString();
      atomicWriteJsonSync(configPath, config);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    logService.error('Failed to create welcome pane', 'WelcomePaneManager', undefined, error instanceof Error ? error : undefined);
    return false;
  } finally {
    releaseCreationLock();
  }
}

/**
 * LEGACY: Ensures a welcome pane exists when there are no dmux panes
 *
 * NOTE: This function is no longer used in normal operation.
 * Welcome pane management is now fully event-based:
 * - Created at startup (src/index.ts)
 * - Destroyed when first pane is created (paneCreation.ts)
 * - Recreated when last pane is closed (paneActions.ts)
 *
 * This function remains available for manual recovery or edge cases only.
 *
 * @param projectRoot - The project root directory
 * @param controlPaneId - The control pane ID
 * @param panesCount - Number of active dmux panes
 */
export async function ensureWelcomePane(
  projectRoot: string,
  controlPaneId: string | undefined,
  panesCount: number
): Promise<void> {
  const logService = LogService.getInstance();

  logService.debug(`ensureWelcomePane called: panesCount=${panesCount}, controlPaneId=${controlPaneId}`, 'WelcomePaneManager');

  // Only create welcome pane if there are no dmux panes
  if (panesCount > 0 || !controlPaneId) {
    logService.debug(`Skipping: panesCount > 0 (${panesCount}) or no controlPaneId (${controlPaneId})`, 'WelcomePaneManager');
    return;
  }

  // Use the coordinated creation function which respects the lock
  await createWelcomePaneCoordinated(projectRoot, controlPaneId);
}
