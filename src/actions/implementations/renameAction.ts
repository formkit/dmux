import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { TmuxService } from '../../services/TmuxService.js';
import { StateManager } from '../../shared/StateManager.js';
import {
  getPaneDisplayName,
  getPaneTmuxTitle,
  sanitizePaneDisplayName,
} from '../../utils/paneTitle.js';
import {
  readWorktreeMetadata,
  writeWorktreeMetadata,
} from '../../utils/worktreeMetadata.js';

const MAX_PANE_DISPLAY_NAME_LENGTH = 80;

function persistWorktreeDisplayName(pane: DmuxPane, displayName?: string): void {
  if (!pane.worktreePath) {
    return;
  }

  const existingMetadata = readWorktreeMetadata(pane.worktreePath) || {};
  writeWorktreeMetadata(pane.worktreePath, {
    ...existingMetadata,
    displayName,
  });
}

export async function renamePane(
  pane: DmuxPane,
  context: ActionContext
): Promise<ActionResult> {
  const currentName = getPaneDisplayName(pane);

  return {
    type: 'input',
    title: 'Rename Pane',
    message: [
      `Rename "${currentName}".`,
      'Leave blank to use the worktree name again.',
    ].join('\n\n'),
    placeholder: pane.slug,
    defaultValue: pane.displayName || currentName,
    onSubmit: async (value: string) => {
      const normalizedName = sanitizePaneDisplayName(value);

      if (normalizedName.length > MAX_PANE_DISPLAY_NAME_LENGTH) {
        return {
          type: 'error',
          message: `Pane names must be ${MAX_PANE_DISPLAY_NAME_LENGTH} characters or fewer.`,
          dismissable: true,
        };
      }

      const nextDisplayName = normalizedName && normalizedName !== pane.slug
        ? normalizedName
        : undefined;
      const currentDisplayName = sanitizePaneDisplayName(pane.displayName || '') || undefined;

      if (currentDisplayName === nextDisplayName) {
        return {
          type: 'info',
          message: `Pane name unchanged: "${currentName}"`,
          dismissable: true,
        };
      }

      try {
        const updatedPane: DmuxPane = {
          ...pane,
          displayName: nextDisplayName,
        };
        const updatedPanes = context.panes.map((candidate) =>
          candidate.id === pane.id ? updatedPane : candidate
        );

        await context.savePanes(updatedPanes);
        persistWorktreeDisplayName(pane, nextDisplayName);
        try {
          const sessionProjectRoot = StateManager.getInstance().getState().projectRoot;
          await TmuxService.getInstance().setPaneTitle(
            pane.paneId,
            getPaneTmuxTitle(updatedPane, sessionProjectRoot || undefined)
          );
        } catch {
          // Periodic title enforcement will reconcile if tmux is transiently unavailable.
        }
        context.onPaneUpdate?.(updatedPane);

        const savedName = getPaneDisplayName(updatedPane);
        return {
          type: 'success',
          message: nextDisplayName
            ? `Renamed pane to "${savedName}"`
            : `Reset pane name to "${savedName}"`,
          dismissable: true,
        };
      } catch (error) {
        return {
          type: 'error',
          message: `Failed to rename pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
          dismissable: true,
        };
      }
    },
  };
}
