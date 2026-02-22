/**
 * REVIEW Action - Cross-agent file-based review
 *
 * 1. Runs the pre_pr hook which writes review findings to a markdown file
 * 2. Sends keys to the original pane's agent to read the review and fix issues
 */

import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { findHook, hasHook, buildHookEnvironment } from '../../utils/hooks.js';
import { TmuxService } from '../../services/TmuxService.js';
import { LogService } from '../../services/LogService.js';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';

export async function reviewPane(
  pane: DmuxPane,
  context: ActionContext,
): Promise<ActionResult> {
  const logger = LogService.getInstance();

  if (!pane.worktreePath) {
    return { type: 'error', message: 'This pane has no worktree', dismissable: true };
  }

  const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

  if (!hasHook(mainRepoPath, 'pre_pr')) {
    return {
      type: 'error',
      message: 'No pre_pr hook found. Create .dmux-hooks/pre_pr to enable reviews.',
      dismissable: true,
    };
  }

  // Determine base branch
  let baseBranch = 'main';
  try {
    const head = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: mainRepoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    baseBranch = head.replace('refs/remotes/origin/', '');
  } catch {
    try {
      execSync('git rev-parse --verify main', { cwd: mainRepoPath, stdio: 'pipe' });
      baseBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', { cwd: mainRepoPath, stdio: 'pipe' });
        baseBranch = 'master';
      } catch {}
    }
  }

  return {
    type: 'confirm',
    title: 'Cross-Agent Review',
    message: `Run a cross-agent review on "${pane.slug}" against ${baseBranch}?\n\nA different agent will review the diff and write findings to a file. Then your pane's agent will fix the issues.`,
    confirmLabel: 'Review',
    cancelLabel: 'Cancel',
    onConfirm: async () => {
      const hookPath = findHook(mainRepoPath, 'pre_pr');
      if (!hookPath) {
        return { type: 'error', message: 'pre_pr hook not found', dismissable: true };
      }

      // Ensure reviews directory exists
      const reviewsDir = path.join(mainRepoPath, '.dmux', 'reviews');
      mkdirSync(reviewsDir, { recursive: true });

      const reviewFile = path.join(reviewsDir, `${pane.slug}.md`);

      // Build env vars — include the review file path
      const env = await buildHookEnvironment(mainRepoPath, pane, {
        DMUX_PR_TITLE: '',
        DMUX_PR_BODY: '',
        DMUX_BASE_BRANCH: baseBranch,
        DMUX_REVIEW_FILE: reviewFile,
      });

      logger.debug(`Running cross-agent review for ${pane.slug} → ${reviewFile}`, 'review');

      // Run hook synchronously — it writes review to DMUX_REVIEW_FILE
      try {
        execSync(hookPath, {
          env: env as NodeJS.ProcessEnv,
          cwd: pane.worktreePath,
          encoding: 'utf-8',
          timeout: 600000, // 10 min
          stdio: 'pipe',
        });
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        return {
          type: 'error',
          message: `Review hook failed: ${stderr || error.message}`,
          dismissable: true,
        };
      }

      // Send the review to the pane's agent via tmux keys
      const reviewRelPath = path.relative(pane.worktreePath!, reviewFile);
      const agentPrompt = `A cross-agent review was written to ${reviewRelPath}. Read it, fix any real issues found, then update the review file noting what you fixed. When done, ask me if I want to commit the changes.`;

      try {
        const tmux = TmuxService.getInstance();
        await tmux.sendShellCommand(pane.paneId, agentPrompt);
        await tmux.sendTmuxKeys(pane.paneId, 'Enter');
      } catch (error: any) {
        return {
          type: 'error',
          message: `Review written to ${reviewRelPath} but failed to send to agent: ${error.message}`,
          dismissable: true,
        };
      }

      return {
        type: 'success',
        message: `Review sent to agent on "${pane.slug}"`,
      };
    },
  };
}
