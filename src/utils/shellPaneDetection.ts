/**
 * Shell Pane Detection Utility
 *
 * Detects manually-created tmux panes and determines their shell type.
 */

import type { DmuxPane } from '../types.js';
import { LogService } from '../services/LogService.js';
import { TmuxService } from '../services/TmuxService.js';
import { resolveProjectRootFromPath } from './projectRoot.js';

/**
 * Detects the shell type running in a tmux pane
 * @param paneId The tmux pane ID (e.g., %1)
 * @returns Shell type (bash, zsh, fish, etc) or 'shell' as fallback
 */
export async function detectShellType(paneId: string): Promise<string> {
  const tmuxService = TmuxService.getInstance();
  try {
    // Get the command running in the pane
    const { execSync } = await import('child_process');
    const command = execSync(
      `tmux display-message -t '${paneId}' -p '#{pane_current_command}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    // Common shells
    const knownShells = ['bash', 'zsh', 'fish', 'sh', 'ksh', 'tcsh', 'csh'];

    // Check if it's a known shell
    const lowerCommand = command.toLowerCase();
    for (const shell of knownShells) {
      if (lowerCommand === shell || lowerCommand.endsWith(`/${shell}`)) {
        return shell;
      }
    }

    // If running something else, still try to detect the parent shell
    // This handles cases where a command is running in the shell
    try {
      const pid = execSync(
        `tmux display-message -t '${paneId}' -p '#{pane_pid}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      // Get parent process
      const ppid = execSync(`ps -o ppid= -p ${pid}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      if (ppid) {
        const parentCommand = execSync(`ps -o comm= -p ${ppid}`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();

        const lowerParent = parentCommand.toLowerCase();
        for (const shell of knownShells) {
          if (lowerParent === shell || lowerParent.endsWith(`/${shell}`)) {
            return shell;
          }
        }
      }
    } catch {
      // Ignore errors when trying to detect parent
    }

    // Fallback to generic 'shell'
    return 'shell';
  } catch (error) {
  //     LogService.getInstance().debug(
  //       `Failed to detect shell type for pane ${paneId}`,
  //       'shellDetection'
  //     );
    return 'shell';
  }
}

/**
 * Information about an untracked pane
 */
export interface UntrackedPaneInfo {
  paneId: string;
  title: string;
  command: string;
}

/**
 * Gets all untracked tmux panes (panes not in dmux config)
 * @param sessionName The tmux session name
 * @param trackedPaneIds Array of pane IDs already tracked by dmux
 * @param controlPaneId Optional control pane ID to exclude
 * @param welcomePaneId Optional welcome pane ID to exclude
 * @returns Array of untracked pane information
 */
export async function getUntrackedPanes(
  sessionName: string,
  trackedPaneIds: string[],
  controlPaneId?: string,
  welcomePaneId?: string
): Promise<UntrackedPaneInfo[]> {
  try {
    // Get all panes in the current session with ID, title, and current command
    const { execSync } = await import('child_process');
    const output = execSync(
      `tmux list-panes -s -F '#{pane_id}::#{pane_title}::#{pane_current_command}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    if (!output) return [];

    const untrackedPanes: UntrackedPaneInfo[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const [paneId, title, command] = line.split('::');

      if (!paneId || !paneId.startsWith('%')) continue;

      // CRITICAL: Skip internal dmux panes by title
      if (title === 'dmux-spacer') {
        continue;
      }
      if (title && title.startsWith('dmux v')) {
        continue;
      }
      if (title === 'Welcome') {
        continue;
      }

      // CRITICAL: Skip control and welcome panes by ID (most reliable method)
      if (controlPaneId && paneId === controlPaneId) {
        continue;
      }
      if (welcomePaneId && paneId === welcomePaneId) {
        continue;
      }

      // CRITICAL: Skip panes running dmux itself (node process running dmux)
      if (command && (command === 'node' || command.includes('dmux'))) {
        continue;
      }

      // Skip already tracked panes
      if (trackedPaneIds.includes(paneId)) continue;

      untrackedPanes.push({ paneId, title: title || '', command: command || '' });
    }

    return untrackedPanes;
  } catch (error) {
    return [];
  }
}

async function detectPaneProjectInfo(
  paneId: string
): Promise<{ projectRoot?: string; projectName?: string }> {
  try {
    const { execSync } = await import('child_process');
    const panePath = execSync(
      `tmux display-message -t '${paneId}' -p '#{pane_current_path}'`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    if (!panePath) {
      return {};
    }

    const resolved = resolveProjectRootFromPath(panePath, panePath);
    return {
      projectRoot: resolved.projectRoot,
      projectName: resolved.projectName,
    };
  } catch {
    return {};
  }
}

/**
 * Creates a DmuxPane object for a shell pane
 * @param paneId The tmux pane ID
 * @param nextId The next available dmux ID number
 * @param existingTitle Optional existing title (used for display but not for tracking)
 * @returns DmuxPane object for the shell pane
 */
export async function createShellPane(paneId: string, nextId: number, existingTitle?: string): Promise<DmuxPane> {
  const tmuxService = TmuxService.getInstance();
  const shellType = await detectShellType(paneId);
  const paneProjectInfo = await detectPaneProjectInfo(paneId);

  // CRITICAL: Always generate unique shell-N slugs for shell panes.
  // Using existing titles (like hostname "Gigablaster.local") causes tracking bugs
  // because multiple panes can have the same title, and titleToId Map can only
  // store one mapping per title. This leads to duplicate pane entries.
  const slug = `shell-${nextId}`;

  // Always set the title to ensure unique titles for proper rebinding
  try {
    await tmuxService.setPaneTitle(paneId, slug);
  } catch (error) {
    // LogService.getInstance().debug(
    //   `Failed to set title for shell pane ${paneId}`,
    //   'shellDetection'
    // );
  }

  return {
    id: `dmux-${nextId}`,
    slug,
    prompt: '', // No prompt for manually created panes
    paneId,
    projectRoot: paneProjectInfo.projectRoot,
    projectName: paneProjectInfo.projectName,
    type: 'shell',
    shellType,
  };
}

/**
 * Gets the next available dmux ID number
 * @param existingPanes Array of existing panes
 * @returns Next available ID number
 */
export function getNextDmuxId(existingPanes: DmuxPane[]): number {
  if (existingPanes.length === 0) return 1;

  // Extract numeric IDs from all panes
  const ids = existingPanes
    .map(p => {
      const match = p.id.match(/^dmux-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(id => id > 0);

  if (ids.length === 0) return 1;

  return Math.max(...ids) + 1;
}
