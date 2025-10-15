import { execSync } from 'child_process';
import fs from 'fs/promises';
import { useCallback } from 'react';
import type { DmuxPane } from '../types.js';
import { enforceControlPaneSize } from '../utils/tmux.js';
import { SIDEBAR_WIDTH } from '../utils/layoutManager.js';

interface Params {
  panes: DmuxPane[];
  savePanes: (p: DmuxPane[]) => Promise<void>;
  setStatusMessage: (msg: string) => void;
  setShowMergeConfirmation: (v: boolean) => void;
  setMergedPane: (pane: DmuxPane | null) => void;
  forceRepaint?: () => void;
}

export default function useWorktreeActions({ panes, savePanes, setStatusMessage, setShowMergeConfirmation, setMergedPane, forceRepaint }: Params) {
  const closePane = useCallback(async (pane: DmuxPane) => {
    try {
      if (pane.testWindowId) {
        try { execSync(`tmux kill-window -t '${pane.testWindowId}'`, { stdio: 'pipe' }); } catch {}
      }
      if (pane.devWindowId) {
        try { execSync(`tmux kill-window -t '${pane.devWindowId}'`, { stdio: 'pipe' }); } catch {}
      }

      // CRITICAL: Force repaint FIRST to prevent blank screen
      if (forceRepaint) {
        forceRepaint();
      }

      // Minimal clearing to avoid layout shifts
      process.stdout.write('\x1b[2J\x1b[H');

      execSync(`tmux kill-pane -t '${pane.paneId}'`, { stdio: 'pipe' });
      // Don't apply global layouts - just enforce sidebar width
      try {
        const controlPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
        enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);
      } catch {}

      const updatedPanes = panes.filter(p => p.id !== pane.id);
      await savePanes(updatedPanes);

      setStatusMessage(`Closed pane: ${pane.slug}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to close pane');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  }, [panes, savePanes, setStatusMessage]);

  const mergeWorktree = useCallback(async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree to merge');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    try {
      setStatusMessage('Checking worktree status...');
      const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });

      if (statusOutput.trim()) {
        setStatusMessage('Staging changes...');
        execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
        setStatusMessage('Committing changes...');
        // Use generic message to avoid bringing in LLM here
        execSync(`git -C "${pane.worktreePath}" commit -m 'chore: worktree changes'`, { stdio: 'pipe' });
      }

      setStatusMessage('Merging into main...');
      try {
        execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
      } catch (mergeError: any) {
        const errorMessage = mergeError.message || String(mergeError);
        if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict')) {
          process.stderr.write('\n\x1b[31m✗ Merge conflict detected!\x1b[0m\n');
          process.stderr.write(`\nThere are merge conflicts when merging branch '${pane.slug}' into '${mainBranch}'.\n`);
          process.stderr.write('\nTo resolve:\n');
          process.stderr.write('1. Manually resolve the merge conflicts in your editor\n');
          process.stderr.write('2. Stage the resolved files: git add <resolved-files>\n');
          process.stderr.write('3. Complete the merge: git commit\n');
          process.stderr.write('4. Run dmux again to continue managing your panes\n');
          process.stderr.write('\nExiting dmux now...\n\n');
          process.stdout.write('\x1b[2J\x1b[H');
          process.stdout.write('\x1b[3J');
          try { execSync('tmux clear-history', { stdio: 'pipe' }); } catch {}
          process.exit(1);
        }
        // Don't remove worktree on merge failure
        throw mergeError;
      }

      // Only remove worktree if merge succeeded
      execSync(`git worktree remove "${pane.worktreePath}"`, { stdio: 'pipe' });
      execSync(`git branch -d ${pane.slug}`, { stdio: 'pipe' });

      setStatusMessage(`Merged ${pane.slug} into ${mainBranch}`);
      setTimeout(() => setStatusMessage(''), 3000);
      setMergedPane(pane);
      setShowMergeConfirmation(true);
    } catch {
      setStatusMessage('Failed to merge - check git status');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [setStatusMessage, setMergedPane, setShowMergeConfirmation]);

  const mergeAndPrune = useCallback(async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree to merge');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    try {
      setStatusMessage('Checking worktree status...');
      const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });

      if (statusOutput.trim()) {
        setStatusMessage('Staging changes...');
        execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
        setStatusMessage('Committing changes...');
        execSync(`git -C "${pane.worktreePath}" commit -m 'chore: worktree changes'`, { stdio: 'pipe' });
      }

      setStatusMessage('Merging into main...');
      try {
        execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
      } catch (mergeError: any) {
        const errorMessage = mergeError.message || String(mergeError);
        if (errorMessage.includes('CONFLICT') || errorMessage.includes('conflict')) {
          process.stderr.write('\n\x1b[31m✗ Merge conflict detected!\x1b[0m\n');
          process.stderr.write(`\nThere are merge conflicts when merging branch '${pane.slug}' into '${mainBranch}'.\n`);
          process.stderr.write('\nTo resolve:\n');
          process.stderr.write('1. Manually resolve the merge conflicts in your editor\n');
          process.stderr.write('2. Stage the resolved files: git add <resolved-files>\n');
          process.stderr.write('3. Complete the merge: git commit\n');
          process.stderr.write('4. Run dmux again to continue managing your panes\n');
          process.stderr.write('\nExiting dmux now...\n\n');
          process.stdout.write('\x1b[2J\x1b[H');
          process.stdout.write('\x1b[3J');
          try { execSync('tmux clear-history', { stdio: 'pipe' }); } catch {}
          process.exit(1);
        }
        // Don't remove worktree on merge failure
        throw mergeError;
      }

      // Only remove worktree if merge succeeded
      execSync(`git worktree remove "${pane.worktreePath}"`, { stdio: 'pipe' });
      execSync(`git branch -d ${pane.slug}`, { stdio: 'pipe' });
      await closePane(pane);
      setStatusMessage(`Merged ${pane.slug} into ${mainBranch} and closed pane`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to merge - check git status');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [closePane, setStatusMessage]);

  const deleteUnsavedChanges = useCallback(async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      await closePane(pane);
      return;
    }

    try {
      setStatusMessage('Removing worktree with unsaved changes...');
      execSync(`git worktree remove --force "${pane.worktreePath}"`, { stdio: 'pipe' });
      try { execSync(`git branch -D ${pane.slug}`, { stdio: 'pipe' }); } catch {}
      await closePane(pane);
      setStatusMessage(`Deleted worktree ${pane.slug} and closed pane`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to delete worktree');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [closePane, setStatusMessage]);

  const handleCloseOption = useCallback(async (option: number, pane: DmuxPane) => {
    switch (option) {
      case 0:
        await mergeAndPrune(pane);
        break;
      case 1:
        await mergeWorktree(pane);
        break;
      case 2:
        await deleteUnsavedChanges(pane);
        break;
      case 3:
        await closePane(pane);
        break;
    }
  }, [mergeAndPrune, mergeWorktree, deleteUnsavedChanges, closePane]);

  return { closePane, mergeWorktree, mergeAndPrune, deleteUnsavedChanges, handleCloseOption } as const;
}
