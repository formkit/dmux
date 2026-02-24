/**
 * Worktree Uncommitted Handler
 * Handles uncommitted changes in the worktree
 */

import type { ActionResult, ActionContext } from '../../types.js';
import type { DmuxPane } from '../../../types.js';
import { handleCommitWithOptions } from '../commitMessageHandler.js';

export interface WorktreeUncommittedIssue {
  type: 'worktree_uncommitted';
  message: string;
  files: string[];
}

export async function handleWorktreeUncommitted(
  issue: WorktreeUncommittedIssue,
  pane: DmuxPane,
  context: ActionContext,
  mainBranch: string,
  retryMerge: () => Promise<ActionResult>
): Promise<ActionResult> {
  return {
    type: 'choice',
    title: 'Worktree Has Uncommitted Changes',
    message: `This worktree has uncommitted changes that must be committed before merge.`,
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
        id: 'cancel',
        label: 'Cancel merge',
        description: 'Resolve manually later',
      },
    ],
    data: {
      kind: 'merge_uncommitted',
      repoPath: pane.worktreePath!,
      targetBranch: mainBranch,
      files: issue.files,
      diffMode: 'target-branch',
    },
    onSelect: async (optionId: string) => {
      if (optionId === 'cancel') {
        return { type: 'info', message: 'Merge cancelled', dismissable: true };
      }

      // Handle commit options
      if (
        optionId === 'commit_automatic' ||
        optionId === 'commit_ai_editable' ||
        optionId === 'commit_manual'
      ) {
        return handleCommitWithOptions(
          pane.worktreePath!,
          optionId as 'commit_automatic' | 'commit_ai_editable' | 'commit_manual',
          retryMerge
        );
      }

      return { type: 'info', message: 'Unknown option', dismissable: true };
    },
    dismissable: true,
  };
}
