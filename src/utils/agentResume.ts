/**
 * Agent Resume Utility
 *
 * Detects agent panes where the agent process has exited (leaving a bare shell)
 * and auto-resumes them using the agent's resume command (e.g., `claude --continue`).
 *
 * This handles the common scenario where an SSH disconnection causes the tmux
 * session to survive but agent processes to exit.
 */

import { TmuxService } from '../services/TmuxService.js';
import { LogService } from '../services/LogService.js';
import {
  buildResumeCommand,
  buildAgentCommand,
  type AgentName,
  type PermissionMode,
} from './agentLaunch.js';
import { SettingsManager } from './settingsManager.js';
import { ensureGeminiFolderTrusted } from './geminiTrust.js';

const KNOWN_SHELLS = ['bash', 'zsh', 'fish', 'sh', 'ksh', 'tcsh', 'csh'];

/**
 * Check if a pane is currently running a shell (agent has exited).
 * Uses tmux's pane_current_command to detect the foreground process.
 */
async function isPaneRunningShell(paneId: string): Promise<boolean> {
  const tmuxService = TmuxService.getInstance();
  try {
    const command = await tmuxService.getPaneCurrentCommand(paneId);
    const lowerCommand = command.toLowerCase();
    return KNOWN_SHELLS.some(
      shell => lowerCommand === shell || lowerCommand.endsWith(`/${shell}`)
    );
  } catch {
    return false; // If we can't check, don't attempt resume
  }
}

/**
 * Resumes agents in all worktree panes where the agent has exited.
 *
 * Called on initial load to recover from SSH disconnection.
 * Only resumes panes that:
 * 1. Have an `agent` field set (were launched with an agent)
 * 2. Have a `worktreePath` (are worktree panes, not shell panes)
 * 3. Still exist in tmux (paneId is in allPaneIds)
 * 4. Are currently running a shell (agent process has exited)
 */
export async function resumeExitedAgents(
  panes: Array<{
    paneId: string;
    agent?: AgentName;
    worktreePath?: string;
    projectRoot?: string;
  }>,
  allPaneIds: string[]
): Promise<void> {
  const candidatePanes = panes.filter(
    p => p.agent && p.worktreePath && allPaneIds.includes(p.paneId)
  );

  if (candidatePanes.length === 0) return;

  const projectRoot = candidatePanes[0]?.projectRoot || process.cwd();
  const settings = new SettingsManager(projectRoot).getSettings();
  const permissionMode = settings.permissionMode;

  const tmuxService = TmuxService.getInstance();

  for (const pane of candidatePanes) {
    try {
      const isShell = await isPaneRunningShell(pane.paneId);
      if (!isShell) continue;

      if (pane.agent === 'gemini') {
        ensureGeminiFolderTrusted(pane.worktreePath!);
      }

      const resumeCommand =
        buildResumeCommand(pane.agent!, permissionMode)
        || buildAgentCommand(pane.agent!, permissionMode);

      LogService.getInstance().info(
        `Resuming agent '${pane.agent}' in pane ${pane.paneId}`,
        'agentResume'
      );

      await tmuxService.sendShellCommand(pane.paneId, resumeCommand);
      await tmuxService.sendTmuxKeys(pane.paneId, 'Enter');
    } catch (error) {
      LogService.getInstance().debug(
        `Failed to resume agent in pane ${pane.paneId}: ${error instanceof Error ? error.message : String(error)}`,
        'agentResume'
      );
    }
  }
}
