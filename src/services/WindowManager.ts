import path from 'path';
import * as fsSync from 'fs';
import { fileURLToPath } from 'url';
import { TmuxService } from './TmuxService.js';
import { LogService } from './LogService.js';
import type { DmuxPane, DmuxConfig, WindowInfo } from '../types.js';
import { SIDEBAR_WIDTH } from '../utils/layoutManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Manages multi-window pane overflow.
 *
 * Responsibilities:
 * - Decide which window a new pane should go in
 * - Create new tmux windows when pane limit is exceeded
 * - Launch sidebar (dmux TUI) in each new window
 * - Switch windows when navigating to panes
 * - Clean up empty windows
 */
export class WindowManager {
  private static instance: WindowManager;

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  /**
   * Get panes belonging to a specific window.
   */
  getPanesInWindow(windowId: string, allPanes: DmuxPane[]): DmuxPane[] {
    return allPanes.filter(p => p.windowId === windowId);
  }

  /**
   * Find the target window for a new pane.
   * Returns the windowId and controlPaneId if a window below the limit exists,
   * or signals that a new window is needed.
   */
  getTargetWindow(
    panes: DmuxPane[],
    windows: WindowInfo[] | undefined,
    maxPanesPerWindow: number,
    mainControlPaneId: string,
    mainWindowId: string,
  ): { windowId: string; controlPaneId: string; needsNewWindow: boolean } {
    // If no windows array, treat all panes as being in the main window
    const effectiveWindows: WindowInfo[] = windows && windows.length > 0
      ? windows
      : [{ windowId: mainWindowId, controlPaneId: mainControlPaneId, windowIndex: 0 }];

    // Try each window in order, find one below the limit
    for (const win of effectiveWindows) {
      const panesInWindow = panes.filter(p =>
        p.windowId === win.windowId || (!p.windowId && win.windowIndex === 0)
      );
      if (panesInWindow.length < maxPanesPerWindow) {
        return {
          windowId: win.windowId,
          controlPaneId: win.controlPaneId,
          needsNewWindow: false,
        };
      }
    }

    // All windows full — need a new window
    return {
      windowId: '',
      controlPaneId: '',
      needsNewWindow: true,
    };
  }

  /**
   * Create a new tmux window and launch a dmux sidebar in it.
   * Returns the WindowInfo for the newly created window.
   */
  async createNewWindow(
    sessionName: string,
    projectRoot: string,
    windowIndex: number,
  ): Promise<WindowInfo> {
    const tmux = TmuxService.getInstance();
    const log = LogService.getInstance();

    // Create the window (detached so we don't switch away from current)
    const windowId = await tmux.newWindow({
      name: `dmux-${windowIndex + 1}`,
      detached: true,
    });

    log.info(`Created new window ${windowId} (index ${windowIndex})`, 'WindowManager');

    // Get the initial pane ID in the new window — this becomes the sidebar
    const paneIds = await tmux.getAllPaneIdsInWindow(windowId);
    const controlPaneId = paneIds[0];

    // Configure the sidebar pane
    await tmux.setPaneTitle(controlPaneId, 'dmux');

    // Launch a dmux sidebar process in the new window
    const dmuxCommand = this.buildDmuxSidebarCommand(projectRoot, windowId);
    await tmux.sendShellCommand(controlPaneId, dmuxCommand);
    await tmux.sendTmuxKeys(controlPaneId, 'Enter');

    // Resize the sidebar to SIDEBAR_WIDTH
    await tmux.resizePane(controlPaneId, { width: SIDEBAR_WIDTH });

    log.info(
      `Launched sidebar in window ${windowId}, controlPane=${controlPaneId}`,
      'WindowManager',
    );

    return { windowId, controlPaneId, windowIndex };
  }

  /**
   * Switch to the window containing a specific pane.
   * No-op if already in the correct window.
   */
  async switchToWindowForPane(pane: DmuxPane): Promise<void> {
    if (!pane.windowId) return;

    const tmux = TmuxService.getInstance();
    try {
      const currentWindowId = await tmux.getCurrentWindowId();
      if (currentWindowId !== pane.windowId) {
        await tmux.selectWindow(pane.windowId);
      }
    } catch (error) {
      LogService.getInstance().warn(
        `Failed to switch to window ${pane.windowId}: ${error}`,
        'WindowManager',
      );
    }
  }

  /**
   * Clean up a window after all its content panes have been closed.
   * Kills the window and returns updated windows array.
   */
  async cleanupEmptyWindow(
    windowInfo: WindowInfo,
    allWindows: WindowInfo[],
  ): Promise<WindowInfo[]> {
    const tmux = TmuxService.getInstance();
    const log = LogService.getInstance();

    // Don't clean up the main window (index 0)
    if (windowInfo.windowIndex === 0) return allWindows;

    try {
      await tmux.killWindow(windowInfo.windowId);
      log.info(
        `Cleaned up empty window ${windowInfo.windowId} (index ${windowInfo.windowIndex})`,
        'WindowManager',
      );
    } catch (error) {
      log.warn(
        `Failed to kill window ${windowInfo.windowId}: ${error}`,
        'WindowManager',
      );
    }

    return allWindows.filter(w => w.windowId !== windowInfo.windowId);
  }

  /**
   * Update a tmux window's name based on the pane slugs it contains.
   * Format: "slug1·slug2" or just "slug1" for single pane.
   */
  async updateWindowName(windowId: string, panesInWindow: DmuxPane[]): Promise<void> {
    const tmux = TmuxService.getInstance();
    try {
      const slugs = panesInWindow.map(p => p.slug);
      const name = slugs.length > 0 ? slugs.join('·') : 'dmux';
      // Truncate to 30 chars max for tmux status bar readability
      const truncated = name.length > 30 ? name.substring(0, 28) + '..' : name;
      await tmux.renameWindow(windowId, truncated);
    } catch {
      // Non-critical — ignore failures
    }
  }

  /**
   * Build the command to launch a dmux sidebar in a secondary window.
   */
  private buildDmuxSidebarCommand(projectRoot: string, windowId: string): string {
    const isDev = process.env.DMUX_DEV === 'true';

    if (isDev) {
      // In dev mode, run from dist directly
      const distIndex = path.join(projectRoot, 'dist', 'index.js');
      return `node "${distIndex}" --window-id "${windowId}"`;
    }

    // Check for local install
    const localDmuxPath = path.join(__dirname, '..', '..', 'dmux');
    if (fsSync.existsSync(localDmuxPath)) {
      return `"${localDmuxPath}" --window-id "${windowId}"`;
    }

    return `dmux --window-id "${windowId}"`;
  }
}
