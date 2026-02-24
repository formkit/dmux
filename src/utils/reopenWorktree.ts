import path from 'path';
import * as fs from 'fs';
import { TmuxService } from '../services/TmuxService.js';
import {
  setupSidebarLayout,
  getTerminalDimensions,
  splitPane,
} from './tmux.js';
import { SIDEBAR_WIDTH, recalculateAndApplyLayout } from './layoutManager.js';
import type { DmuxPane, DmuxConfig } from '../types.js';
import { atomicWriteJsonSync } from './atomicWrite.js';
import { buildWorktreePaneTitle } from './paneTitle.js';
import {
  AGENT_IDS,
  buildAgentCommand,
  buildResumeCommand,
  type AgentName,
} from './agentLaunch.js';
import { ensureGeminiFolderTrusted } from './geminiTrust.js';
import { SettingsManager } from './settingsManager.js';
import { filterEnabledAgents, getInstalledAgents } from './agentDetection.js';

export interface ReopenWorktreeOptions {
  slug: string;
  worktreePath: string;
  projectRoot: string; // Target repo root for the reopened pane
  sessionConfigPath?: string; // Shared dmux config path for this session
  sessionProjectRoot?: string; // Session root for welcome pane/layout state
  existingPanes: DmuxPane[];
}

export interface ReopenWorktreeResult {
  pane: DmuxPane;
}

/**
 * Reopens a closed worktree by creating a new pane in the existing worktree
 * and launching the best available agent resume command.
 */
export async function reopenWorktree(
  options: ReopenWorktreeOptions
): Promise<ReopenWorktreeResult> {
  const {
    slug,
    worktreePath,
    projectRoot,
    existingPanes,
    sessionConfigPath: optionsSessionConfigPath,
    sessionProjectRoot: optionsSessionProjectRoot,
  } = options;
  const paneProjectName = path.basename(projectRoot);
  const settings = new SettingsManager(projectRoot).getSettings();
  const sessionProjectRoot = optionsSessionProjectRoot
    || (optionsSessionConfigPath ? path.dirname(path.dirname(optionsSessionConfigPath)) : projectRoot);

  const tmuxService = TmuxService.getInstance();
  const originalPaneId = tmuxService.getCurrentPaneIdSync();

  // Load config to get control pane info
  const configPath = optionsSessionConfigPath
    || path.join(sessionProjectRoot, '.dmux', 'dmux.config.json');
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
    paneInfo = setupSidebarLayout(controlPaneId, projectRoot);
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
    const paneTitle = projectRoot === sessionProjectRoot
      ? slug
      : buildWorktreePaneTitle(slug, projectRoot, paneProjectName);
    await tmuxService.setPaneTitle(paneInfo, paneTitle);
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

  // Detect which agent to use - prefer enabled agents and then fallback order.
  const installedAgents = await getInstalledAgents();
  const enabledAgents = filterEnabledAgents(installedAgents, settings.enabledAgents);
  const candidateAgents = enabledAgents.length > 0 ? enabledAgents : installedAgents;
  const preferredOrder: AgentName[] = [
    'claude',
    'codex',
    'opencode',
    ...AGENT_IDS.filter((agent) =>
      !['claude', 'codex', 'opencode'].includes(agent)
    ),
  ];
  const agent = preferredOrder.find((candidate) =>
    candidateAgents.includes(candidate)
  );

  // Resume the agent session (or start interactive mode when no resume command is available).
  if (agent) {
    if (agent === 'gemini') {
      ensureGeminiFolderTrusted(worktreePath);
    }

    const resumeCommand =
      buildResumeCommand(agent, settings.permissionMode)
      || buildAgentCommand(agent, settings.permissionMode);
    await tmuxService.sendShellCommand(paneInfo, resumeCommand);
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
  }

  // Keep focus on the new pane
  await tmuxService.selectPane(paneInfo);

  // Create the pane object
  const newPane: DmuxPane = {
    id: `dmux-${Date.now()}`,
    slug,
    prompt: '(Reopened session)',
    paneId: paneInfo,
    projectRoot,
    projectName: paneProjectName,
    worktreePath,
    agent,
    autopilot: settings.enableAutopilotByDefault ?? false,
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
      destroyWelcomePaneCoordinated(sessionProjectRoot);
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
