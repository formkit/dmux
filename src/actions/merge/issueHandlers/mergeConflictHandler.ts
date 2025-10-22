/**
 * Merge Conflict Handler
 * Handles detected merge conflicts
 */

import type { ActionResult, ActionContext } from '../../types.js';
import type { DmuxPane } from '../../../types.js';

export interface MergeConflictIssue {
  type: 'merge_conflict';
  message: string;
  files: string[];
}

export async function handleMergeConflict(
  issue: MergeConflictIssue,
  mainBranch: string,
  mainRepoPath: string,
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  // Check if we have the fallback message
  const hasRealFiles = issue.files.length > 0 && !issue.files[0].includes('conflict detection incomplete');

  const message = hasRealFiles
    ? `Conflicts detected in:\n${issue.files.slice(0, 5).map(f => ` •  ${f}`).join('\n')}${issue.files.length > 5 ? '\n  ...' : ''}`
    : `Potential conflicts detected between ${mainBranch} and ${pane.slug}.\n\nThe branches have diverged and may have conflicting changes.\nYou can try AI-assisted merge or resolve manually.`;

  return {
    type: 'choice',
    title: 'Merge Conflicts Detected',
    message,
    options: [
      {
        id: 'ai_merge',
        label: 'Try AI-assisted merge',
        description: 'Let AI intelligently combine both versions',
        default: true,
      },
      {
        id: 'manual_merge',
        label: 'Manual resolution',
        description: 'Jump to pane to resolve conflicts',
      },
      {
        id: 'cancel',
        label: 'Cancel merge',
        description: 'Do nothing',
      },
    ],
    onSelect: async (optionId: string) => {
      if (optionId === 'cancel') {
        return { type: 'info', message: 'Merge cancelled', dismissable: true };
      }

      if (optionId === 'manual_merge') {
        // Start the merge process and let user resolve manually
        const { executeMergeWithConflictHandling } = await import('../mergeExecution.js');
        return executeMergeWithConflictHandling(pane, context, mainBranch, mainRepoPath, 'manual');
      }

      if (optionId === 'ai_merge') {
        // Attempt AI-assisted merge via new pane
        const { createConflictResolutionPaneForMerge } = await import('../conflictResolution.js');
        return createConflictResolutionPaneForMerge(pane, context, mainBranch, mainRepoPath);
      }

      return { type: 'info', message: 'Unknown option', dismissable: true };
    },
    dismissable: true,
  };
}
