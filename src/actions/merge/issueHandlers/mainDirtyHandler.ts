/**
 * Main Dirty Handler
 * Handles uncommitted changes in the main branch
 */

import type { ActionResult, ActionContext } from '../../types.js';
import type { DmuxPane } from '../../../types.js';
import { handleCommitWithOptions } from '../commitMessageHandler.js';
import { LogService } from '../../../services/LogService.js';

export interface MainDirtyIssue {
  type: 'main_dirty';
  message: string;
  files: string[];
}

export async function handleMainDirty(
  issue: MainDirtyIssue,
  mainBranch: string,
  mainRepoPath: string,
  pane: DmuxPane,
  context: ActionContext,
  retryMerge: () => Promise<ActionResult>
): Promise<ActionResult> {
  const { stashChanges } = await import('../../../utils/mergeValidation.js');

  LogService.getInstance().info(`Issue files: ${JSON.stringify(issue.files)}`, 'mainDirtyHandler');
  const message = `${mainBranch} has uncommitted changes that must be committed or stashed before merge.`;
  LogService.getInstance().info(`Final message: ${JSON.stringify(message)}`, 'mainDirtyHandler');

  return {
    type: 'choice',
    title: 'Main Branch Has Uncommitted Changes',
    message,
    options: [
      {
        id: 'commit_automatic',
        label: 'AI commit (automatic)',
        description: 'Auto-generate and commit immediately',
        default: true,
      },
      {
        id: 'commit_ai_editable',
        label: 'AI commit (editable)',
        description: 'Generate message from diff, edit before commit',
      },
      {
        id: 'commit_manual',
        label: 'Manual commit message',
        description: 'Write your own commit message',
      },
      {
        id: 'stash_main',
        label: 'Stash changes in main',
        description: 'Temporarily stash uncommitted changes',
      },
      {
        id: 'cancel',
        label: 'Cancel merge',
        description: 'Resolve manually later',
      },
    ],
    data: {
      kind: 'merge_uncommitted',
      repoPath: mainRepoPath,
      targetBranch: mainBranch,
      files: issue.files,
      diffMode: 'working-tree',
    },
    onSelect: async (optionId: string) => {
      if (optionId === 'cancel') {
        return { type: 'info', message: 'Merge cancelled', dismissable: true };
      }

      if (optionId === 'stash_main') {
        const result = stashChanges(mainRepoPath);
        if (!result.success) {
          return { type: 'error', message: `Stash failed: ${result.error}`, dismissable: true };
        }
        // Retry merge after stashing
        return retryMerge();
      }

      // Handle commit options
      if (
        optionId === 'commit_automatic' ||
        optionId === 'commit_ai_editable' ||
        optionId === 'commit_manual'
      ) {
        return handleCommitWithOptions(
          mainRepoPath,
          optionId as 'commit_automatic' | 'commit_ai_editable' | 'commit_manual',
          retryMerge
        );
      }

      return { type: 'info', message: 'Unknown option', dismissable: true };
    },
    dismissable: true,
  };
}
