/**
 * Conflict Resolution - UI logic for conflict resolution workflows
 *
 * This module handles ActionResult flows for creating conflict resolution panes
 * with AI agents to help resolve merge conflicts.
 */

import type { ActionResult, ActionContext } from '../types.js';
import type { DmuxPane } from '../../types.js';
import { TmuxService } from '../../services/TmuxService.js';
import { getPaneBranchName } from '../../utils/git.js';
import {
  getAgentDescription,
  getAgentLabel,
  isAgentName,
  type AgentName,
} from '../../utils/agentLaunch.js';

/**
 * Create a new pane for AI-assisted conflict resolution
 */
export async function createConflictResolutionPaneForMerge(
  pane: DmuxPane,
  context: ActionContext,
  targetBranch: string,
  targetRepoPath: string
): Promise<ActionResult> {
  // First, check which agents are available and enabled.
  const { filterEnabledAgents, getInstalledAgents } = await import('../../utils/agentDetection.js');
  const { SettingsManager } = await import('../../utils/settingsManager.js');
  const settings = new SettingsManager(targetRepoPath).getSettings();
  const installedAgents = await getInstalledAgents();
  const availableAgents = filterEnabledAgents(installedAgents, settings.enabledAgents);

  if (availableAgents.length === 0) {
    return {
      type: 'error',
      message: 'No enabled AI agents available. Enable an agent in Settings > Enabled Agents.',
      dismissable: true,
    };
  }

  // If multiple agents available, ask user to choose
  if (availableAgents.length > 1) {
    return {
      type: 'choice',
      title: 'Choose AI Agent for Conflict Resolution',
      message: 'Which agent would you like to use to resolve merge conflicts?',
      options: availableAgents.map(agent => ({
        id: agent,
        label: getAgentLabel(agent),
        description: getAgentDescription(agent),
        default: agent === 'claude',
      })),
      onSelect: async (agentId: string) => {
        if (!isAgentName(agentId)) {
          return {
            type: 'error',
            message: `Unsupported agent: ${agentId}`,
            dismissable: true,
          };
        }
        return createAndLaunchConflictPane(
          pane,
          context,
          targetBranch,
          targetRepoPath,
          agentId
        );
      },
      dismissable: true,
    };
  }

  // Only one agent available, use it directly
  return createAndLaunchConflictPane(
    pane,
    context,
    targetBranch,
    targetRepoPath,
    availableAgents[0]
  );
}

/**
 * Actually create and launch the conflict resolution pane
 */
async function createAndLaunchConflictPane(
  pane: DmuxPane,
  context: ActionContext,
  targetBranch: string,
  targetRepoPath: string,
  agent: AgentName
): Promise<ActionResult> {
  try {
    const { createConflictResolutionPane } = await import('../../utils/conflictResolutionPane.js');

    // Create the new pane
    // NOTE: We pass the WORKTREE path as targetRepoPath because that's where
    // the conflicts exist and need to be resolved (not in main repo)
    const conflictPane = await createConflictResolutionPane({
      sourceBranch: getPaneBranchName(pane),
      targetBranch,
      targetRepoPath: pane.worktreePath!, // CRITICAL: Use worktree, not main repo
      agent,
      projectName: context.projectName,
      existingPanes: context.panes,
    });

    // Add the new pane to the panes list
    const updatedPanes = [...context.panes, conflictPane];
    await context.savePanes(updatedPanes);

    // Notify about the new pane
    if (context.onPaneUpdate) {
      context.onPaneUpdate(conflictPane);
    }

    // Start monitoring for conflict resolution completion
    const { startConflictMonitoring } = await import('../../utils/conflictMonitor.js');
    startConflictMonitoring({
      conflictPaneId: conflictPane.paneId,
      repoPath: pane.worktreePath!, // Monitor the WORKTREE, not main repo
      onResolved: async () => {
        // Conflicts resolved! Close the conflict pane and trigger cleanup
        try {
          console.error(`[conflictResolution] Conflicts resolved for ${pane.slug}, cleaning up conflict pane ${conflictPane.id}`);
          const tmuxService = TmuxService.getInstance();

          // Kill the conflict pane first
          console.error(`[conflictResolution] Killing conflict pane ${conflictPane.paneId}`);
          await tmuxService.killPane(conflictPane.paneId);

          // CRITICAL: Read FRESH panes from StateManager, not stale context.panes
          // The conflict pane was added to state earlier, and StateManager has the latest list
          const { StateManager } = await import('../../shared/StateManager.js');
          const stateManager = StateManager.getInstance();
          const currentPanes = stateManager.getPanes();
          console.error(`[conflictResolution] Current panes: ${currentPanes.map(p => p.id).join(', ')}`);

          // Remove conflict pane from state
          const panesWithoutConflictPane = currentPanes.filter((p: DmuxPane) => p.id !== conflictPane.id);
          console.error(`[conflictResolution] Removing conflict pane ${conflictPane.id}, remaining: ${panesWithoutConflictPane.map(p => p.id).join(', ')}`);
          await context.savePanes(panesWithoutConflictPane);

          // Now trigger the cleanup flow for the original pane
          // We need to execute the merge completion flow
          const { executeMerge } = await import('../merge/mergeExecution.js');

          // Create updated context with current pane list (without conflict pane)
          const updatedContext = {
            ...context,
            panes: panesWithoutConflictPane,
          };

          // Re-run executeMerge which will now succeed (conflicts are resolved)
          // This will return the cleanup confirmation dialog
          // IMPORTANT: Pass skipWorktreeMerge=true because agent already resolved conflicts
          console.error(`[conflictResolution] Executing merge for original pane ${pane.id} (${pane.slug})`);
          const result = await executeMerge(pane, updatedContext, targetBranch, targetRepoPath, true);

          // If we have the onActionResult callback, use it to show the dialog
          if (context.onActionResult) {
            console.error(`[conflictResolution] Showing merge result dialog to user`);
            await context.onActionResult(result);
          }
        } catch (error) {
          console.error('[conflictResolution] Error in onResolved:', error);
        }
      },
    });

    return {
      type: 'navigation',
      title: 'Conflict Resolution Pane Created',
      message: `Created pane "${conflictPane.slug}" with ${agent} to help resolve conflicts. Switch to it to see the AI working.`,
      targetPaneId: conflictPane.id,
      dismissable: true,
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to create conflict resolution pane: ${error instanceof Error ? error.message : String(error)}`,
      dismissable: true,
    };
  }
}
