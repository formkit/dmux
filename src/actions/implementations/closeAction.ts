/**
 * CLOSE Action - Close a pane with various cleanup options
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import type { DmuxPane, DmuxConfig } from '../../types.js';
import type { ActionResult, ActionContext, ActionOption } from '../types.js';
import { StateManager } from '../../shared/StateManager.js';
import { triggerHook } from '../../utils/hooks.js';
import { LogService } from '../../services/LogService.js';
import { TMUX_SPLIT_DELAY } from '../../constants/timing.js';

/**
 * Close a pane - presents options for how to close
 */
export async function closePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  // For shell panes (no worktree), close immediately without options
  if (pane.type === 'shell' || !pane.worktreePath) {
    return executeCloseOption(pane, context, 'kill_only');
  }

  // For worktree panes, present options
  const options: ActionOption[] = [
    {
      id: 'kill_only',
      label: 'Just close pane',
      description: 'Keep worktree and branch',
      default: true,
    },
    {
      id: 'kill_and_clean',
      label: 'Close and remove worktree',
      description: 'Delete worktree but keep branch',
      danger: true,
    },
    {
      id: 'kill_clean_branch',
      label: 'Close and delete everything',
      description: 'Remove worktree and delete branch',
      danger: true,
    },
  ];

  return {
    type: 'choice',
    title: 'Close Pane',
    message: `How do you want to close "${pane.slug}"?`,
    options,
    onSelect: async (optionId: string) => {
      return executeCloseOption(pane, context, optionId);
    },
    dismissable: true,
  };
}

/**
 * Execute the selected close option
 */
async function executeCloseOption(
  pane: DmuxPane,
  context: ActionContext,
  option: string
): Promise<ActionResult> {
  try {
    // Get project root for hooks
    const state = StateManager.getInstance().getState();
    const projectRoot = state.projectRoot || process.cwd();

    // Trigger before_pane_close hook
    await triggerHook('before_pane_close', projectRoot, pane);

    // CRITICAL: Pause ConfigWatcher to prevent race condition where
    // the watcher reloads the pane list from disk before our save completes
    StateManager.getInstance().pauseConfigWatcher();

    try {
      // Kill the tmux pane - use a more robust approach
      try {
        // First, try to kill any running process in the pane (like Claude)
        try {
          execSync(`tmux send-keys -t '${pane.paneId}' C-c`, { stdio: 'pipe' });
          // Wait a moment for the process to exit
          await new Promise(resolve => setTimeout(resolve, TMUX_SPLIT_DELAY));
        } catch {
          // Process might not be running
        }

        // Now kill the pane
        execSync(`tmux kill-pane -t '${pane.paneId}'`, { stdio: 'pipe' });

        // Verify the pane is actually gone
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          // Check if pane still exists
          const paneList = execSync('tmux list-panes -F "#{pane_id}"', { encoding: 'utf-8', stdio: 'pipe' });
          if (paneList.includes(pane.paneId)) {
            const msg = `Pane ${pane.paneId} still exists after kill attempt`;
            console.error(`Warning: ${msg}`);
            LogService.getInstance().warn(msg, 'paneActions', pane.id);
          }
        } catch {
          // Error listing panes is fine
        }
      } catch (killError) {
        // Pane might already be dead, which is fine
        const msg = `Error killing pane ${pane.paneId}`;
        console.error(msg, killError);
        LogService.getInstance().error(msg, 'paneActions', pane.id, killError instanceof Error ? killError : undefined);
      }

      // Handle worktree cleanup based on option
      if (pane.worktreePath && (option === 'kill_and_clean' || option === 'kill_clean_branch')) {
        const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

        // Trigger before_worktree_remove hook
        await triggerHook('before_worktree_remove', projectRoot, pane);

        try {
          execSync(`git worktree remove "${pane.worktreePath}" --force`, {
            stdio: 'pipe',
            cwd: mainRepoPath,
          });
        } catch {
          // Worktree might already be removed
        }

        // Trigger worktree_removed hook
        await triggerHook('worktree_removed', projectRoot, pane);

        // Delete branch if requested
        if (option === 'kill_clean_branch') {
          try {
            execSync(`git branch -D ${pane.slug}`, {
              stdio: 'pipe',
              cwd: mainRepoPath,
            });
          } catch {
            // Branch might not exist or already deleted
          }
        }
      }

      // Remove from panes list
      const updatedPanes = context.panes.filter(p => p.id !== pane.id);
      await context.savePanes(updatedPanes);

      if (context.onPaneRemove) {
        context.onPaneRemove(pane.paneId); // Pass tmux pane ID, not dmux ID
      }

      // Recalculate layout for remaining panes
      try {
        const config: DmuxConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.dmux', 'dmux.config.json'), 'utf-8'));
        if (config.controlPaneId && updatedPanes.length > 0) {
          const { recalculateAndApplyLayout } = await import('../../utils/layoutManager.js');
          const { getTerminalDimensions } = await import('../../utils/tmux.js');
          const dimensions = getTerminalDimensions();

          recalculateAndApplyLayout(
            config.controlPaneId,
            updatedPanes.map(p => p.paneId),
            dimensions.width,
            dimensions.height
          );

          LogService.getInstance().debug(`Recalculated layout after closing pane: ${updatedPanes.length} panes remaining`, 'paneActions');
        }
      } catch (error) {
        // Log but don't fail - layout recalc is non-critical
        LogService.getInstance().debug('Failed to recalculate layout after pane close', 'paneActions');
      }

      // Wait a bit for the file save to stabilize
      await new Promise(resolve => setTimeout(resolve, 200));

      // CRITICAL: Aggressively clear terminal BEFORE returning success
      // This prevents artifacts when Ink re-renders the status message
      try {
        // Clear screen with ANSI codes
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
        // Clear tmux history and scrollback
        execSync('tmux clear-history', { stdio: 'pipe' });
        // Force tmux client refresh
        execSync('tmux refresh-client', { stdio: 'pipe' });
      } catch {
        // Ignore clearing errors
      }

      // Trigger pane_closed hook (after everything is cleaned up)
      await triggerHook('pane_closed', projectRoot, pane);

      // If we just closed the last pane, recreate the welcome pane and recalculate layout
      if (updatedPanes.length === 0) {
        const { handleLastPaneRemoved } = await import('../../utils/postPaneCleanup.js');
        await handleLastPaneRemoved(projectRoot);
      }

      return {
        type: 'success',
        message: `Pane "${pane.slug}" closed successfully`,
        dismissable: true,
      };
    } finally {
      // CRITICAL: Always resume watcher, even if there was an error
      StateManager.getInstance().resumeConfigWatcher();
    }
  } catch (error) {
    // Clear before showing error too
    try {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch {}

    return {
      type: 'error',
      message: `Failed to close pane: ${error}`,
      dismissable: true,
    };
  }
}
