import { renderAsciiArt } from './asciiArt.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';
import { SIDEBAR_WIDTH } from './layoutManager.js';

/**
 * Creates a welcome pane in the tmux session
 * This pane displays ASCII art and has no command prompt
 *
 * @param controlPaneId - The ID of the control (sidebar) pane
 * @returns The pane ID of the created welcome pane, or undefined if creation failed
 */
export async function createWelcomePane(controlPaneId: string): Promise<string | undefined> {
  const logService = LogService.getInstance();
  const tmuxService = TmuxService.getInstance();

  try {
    // Split horizontally to the right of the control pane
    // This creates a new pane that takes up the rest of the horizontal space
    const welcomePaneId = await tmuxService.splitPane({ targetPane: controlPaneId });

    if (!welcomePaneId) {
      logService.error('Failed to create welcome pane: no pane ID returned', 'WelcomePane');
      return undefined;
    }

    // Set pane title
    try {
      await tmuxService.setPaneTitle(welcomePaneId, "Welcome");
    } catch {
      // Ignore title errors
    }

    // Wait for the shell to initialize in the new pane
    await new Promise(resolve => setTimeout(resolve, 300));

    // Render the ASCII art in the pane
    await renderAsciiArt({
      paneId: welcomePaneId,
      art: [], // Uses default from decorative-pane.js
    });

    // Give the script time to start
    await new Promise(resolve => setTimeout(resolve, 200));

    // Welcome pane uses full terminal dimensions
    // CRITICAL: Use main-vertical layout to lock sidebar at fixed width
    try {
      const dimensions = await tmuxService.getTerminalDimensions();

      // Apply main-vertical layout FIRST (this locks sidebar width)
      const { execSync } = await import('child_process');
      execSync(`tmux set-window-option main-pane-width ${SIDEBAR_WIDTH}`, { stdio: 'pipe' });
      execSync(`tmux select-layout main-vertical`, { stdio: 'pipe' });

      // Refresh to apply layout changes
      await tmuxService.refreshClient();
    } catch (error) {
      // Silently ignore layout errors
    }

    // Switch focus back to the control pane (dmux sidebar)
    try {
      const { execSync } = await import('child_process');
      execSync(`tmux select-pane -t '${controlPaneId}'`, { stdio: 'pipe' });
    } catch {
      // Ignore if focus switch fails
    }

    return welcomePaneId;
  } catch (error) {
    logService.error('Failed to create welcome pane', 'WelcomePane', undefined, error instanceof Error ? error : undefined);
    return undefined;
  }
}

/**
 * Destroys the welcome pane if it exists
 *
 * @param welcomePaneId - The pane ID of the welcome pane to destroy
 */
export async function destroyWelcomePane(welcomePaneId: string | undefined): Promise<void> {
  if (!welcomePaneId) {
    return;
  }

  const logService = LogService.getInstance();
  const tmuxService = TmuxService.getInstance();

  try {
    // Check if the pane still exists before trying to kill it
    const paneExists = await tmuxService.paneExists(welcomePaneId);

    if (!paneExists) {
      return;
    }

    // Kill the pane
    await tmuxService.killPane(welcomePaneId);
  } catch (error) {
    // Pane doesn't exist or already killed - that's fine
  }
}

/**
 * Checks if a welcome pane exists and is still alive
 *
 * @param welcomePaneId - The pane ID to check
 * @returns true if the pane exists, false otherwise
 */
export async function welcomePaneExists(welcomePaneId: string | undefined): Promise<boolean> {
  if (!welcomePaneId) {
    return false;
  }

  const tmuxService = TmuxService.getInstance();
  return await tmuxService.paneExists(welcomePaneId);
}
