import path from 'path';
import * as fs from 'fs';
import { TmuxService } from '../services/TmuxService.js';
import {
  setupSidebarLayout,
  getContentPaneIds,
  getTerminalDimensions,
  splitPane,
} from './tmux.js';
import { SIDEBAR_WIDTH, recalculateAndApplyLayout } from './layoutManager.js';
import type { DmuxPane, DmuxConfig } from '../types.js';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { TMUX_LAYOUT_APPLY_DELAY } from '../constants/timing.js';

export interface ReopenWorktreeOptions {
  slug: string;
  worktreePath: string;
  projectRoot: string;
  existingPanes: DmuxPane[];
}

export interface ReopenWorktreeResult {
  pane: DmuxPane;
}

/**
 * Reopens a closed worktree by creating a new pane in the existing worktree
 * and running `claude --continue` to resume the previous session
 */
export async function reopenWorktree(
  options: ReopenWorktreeOptions
): Promise<ReopenWorktreeResult> {
  const { slug, worktreePath, projectRoot, existingPanes } = options;

  const tmuxService = TmuxService.getInstance();
  const originalPaneId = tmuxService.getCurrentPaneIdSync();

  // Load config to get control pane info
  const configPath = path.join(projectRoot, '.dmux', 'dmux.config.json');
  let controlPaneId: string | undefined;

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: DmuxConfig = JSON.parse(configContent);
    controlPaneId = config.controlPaneId;

    // Verify the control pane ID from config still exists
    if (controlPaneId) {
      const exists = await tmuxService.paneExists(controlPaneId);
      if (!exists) {
        controlPaneId = originalPaneId;
        config.controlPaneId = controlPaneId;
        config.controlPaneSize = SIDEBAR_WIDTH;
        config.lastUpdated = new Date().toISOString();
        atomicWriteJsonSync(configPath, config);
      }
    }

    if (!controlPaneId) {
      controlPaneId = originalPaneId;
      config.controlPaneId = controlPaneId;
      config.controlPaneSize = SIDEBAR_WIDTH;
      config.lastUpdated = new Date().toISOString();
      atomicWriteJsonSync(configPath, config);
    }
  } catch {
    controlPaneId = originalPaneId;
  }

  // Enable pane borders to show titles
  try {
    tmuxService.setGlobalOptionSync('pane-border-status', 'top');
  } catch {
    // Ignore if already set or fails
  }

  // Determine if this is the first content pane
  const isFirstContentPane = existingPanes.length === 0;

  let paneInfo: string;

  if (isFirstContentPane) {
    paneInfo = setupSidebarLayout(controlPaneId);
    await new Promise((resolve) => setTimeout(resolve, 300));
  } else {
    // Subsequent panes - always split horizontally
    const dmuxPaneIds = existingPanes.map(p => p.paneId);
    const targetPane = dmuxPaneIds[dmuxPaneIds.length - 1];
    paneInfo = splitPane({ targetPane });
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  // Set pane title
  try {
    await tmuxService.setPaneTitle(paneInfo, slug);
  } catch {
    // Ignore if setting title fails
  }

  // Apply optimal layout
  if (controlPaneId) {
    const dimensions = getTerminalDimensions();
    const allContentPaneIds = [...existingPanes.map(p => p.paneId), paneInfo];

    await recalculateAndApplyLayout(
      controlPaneId,
      allContentPaneIds,
      dimensions.width,
      dimensions.height
    );

    await tmuxService.refreshClient();
  }

  // CD into the worktree
  await tmuxService.sendShellCommand(paneInfo, `cd "${worktreePath}"`);
  await tmuxService.sendTmuxKeys(paneInfo, 'Enter');

  // Wait for CD to complete
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Run claude --continue to resume the session
  const claudeCmd = 'claude --continue --permission-mode=acceptEdits';
  await tmuxService.sendShellCommand(paneInfo, claudeCmd);
  await tmuxService.sendTmuxKeys(paneInfo, 'Enter');

  // Keep focus on the new pane
  await tmuxService.selectPane(paneInfo);

  // Create the pane object
  const newPane: DmuxPane = {
    id: `dmux-${Date.now()}`,
    slug,
    prompt: '(Reopened session)',
    paneId: paneInfo,
    worktreePath,
    agent: 'claude',
    autopilot: false,
  };

  // Handle welcome pane destruction if first content pane
  if (isFirstContentPane) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: DmuxConfig = JSON.parse(configContent);

      config.panes = [...existingPanes, newPane];
      config.lastUpdated = new Date().toISOString();
      atomicWriteJsonSync(configPath, config);

      const { destroyWelcomePaneCoordinated } = await import('./welcomePaneManager.js');
      destroyWelcomePaneCoordinated(projectRoot);
    } catch {
      // Log but don't fail
    }
  }

  // Switch back to the original pane
  await tmuxService.selectPane(originalPaneId);

  return {
    pane: newPane,
  };
}
