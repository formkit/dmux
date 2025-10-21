/**
 * Conflict Resolution - UI logic for conflict resolution workflows
 *
 * This module handles ActionResult flows for creating conflict resolution panes
 * with AI agents to help resolve merge conflicts.
 */

import type { ActionResult, ActionContext } from '../types.js';
import type { DmuxPane } from '../../types.js';

/**
 * Create a new pane for AI-assisted conflict resolution
 */
export async function createConflictResolutionPaneForMerge(
  pane: DmuxPane,
  context: ActionContext,
  targetBranch: string,
  targetRepoPath: string
): Promise<ActionResult> {
  // First, check which agents are available
  const { findClaudeCommand, findOpencodeCommand } = await import('../../utils/agentDetection.js');

  const availableAgents: Array<'claude' | 'opencode'> = [];
  if (await findClaudeCommand()) availableAgents.push('claude');
  if (await findOpencodeCommand()) availableAgents.push('opencode');

  if (availableAgents.length === 0) {
    return {
      type: 'error',
      message: 'No AI agents available. Please install claude or opencode.',
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
        label: agent === 'claude' ? 'Claude Code' : 'OpenCode',
        description: agent === 'claude' ? 'Anthropic Claude' : 'Open-source alternative',
        default: agent === 'claude',
      })),
      onSelect: async (agentId: string) => {
        return createAndLaunchConflictPane(
          pane,
          context,
          targetBranch,
          targetRepoPath,
          agentId as 'claude' | 'opencode'
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
  agent: 'claude' | 'opencode'
): Promise<ActionResult> {
  try {
    const { createConflictResolutionPane } = await import('../../utils/conflictResolutionPane.js');

    // Create the new pane
    const conflictPane = await createConflictResolutionPane({
      sourceBranch: pane.slug,
      targetBranch,
      targetRepoPath,
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
