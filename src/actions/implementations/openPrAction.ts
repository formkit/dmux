import type { DmuxPane } from '../../types.js';
import type { ActionResult, ActionContext } from '../types.js';
import { isGhAvailable, isGhAuthenticated, pushBranch, createPr, getExistingPr } from '../../utils/ghCli.js';
import { generatePrDescription } from '../../utils/prDescription.js';
import { generateCommitMessage } from '../../utils/aiMerge.js';
import { triggerHookSync, triggerHook } from '../../utils/hooks.js';
import { LogService } from '../../services/LogService.js';
import { execSync } from 'child_process';

export async function openPr(
  pane: DmuxPane,
  context: ActionContext,
): Promise<ActionResult> {
  const logger = LogService.getInstance();

  // 1. Validate
  if (!pane.worktreePath) {
    return { type: 'error', message: 'This pane has no worktree', dismissable: true };
  }

  // 2. Check gh available + authenticated
  if (!(await isGhAvailable())) {
    return {
      type: 'error',
      message: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
      dismissable: true,
    };
  }

  if (!(await isGhAuthenticated())) {
    return {
      type: 'error',
      message: 'GitHub CLI is not authenticated. Run: gh auth login',
      dismissable: true,
    };
  }

  const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');
  const branch = pane.slug;

  // 2b. Determine main branch and validate we're not on it
  let mainBranch = 'main';
  try {
    const head = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: mainRepoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    mainBranch = head.replace('refs/remotes/origin/', '');
  } catch {
    // Try common branch names
    try {
      execSync('git rev-parse --verify main', { cwd: mainRepoPath, stdio: 'pipe' });
      mainBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', { cwd: mainRepoPath, stdio: 'pipe' });
        mainBranch = 'master';
      } catch {}
    }
  }

  if (branch === mainBranch) {
    return {
      type: 'error',
      message: `Cannot create a PR from ${mainBranch} to ${mainBranch}. This pane is on the main branch.`,
      dismissable: true,
    };
  }

  // 3. Check for existing PR
  const existingPr = await getExistingPr(mainRepoPath, branch);
  if (existingPr) {
    return {
      type: 'info',
      message: `PR #${existingPr.prNumber} already exists: ${existingPr.prUrl}`,
      dismissable: true,
      data: existingPr,
    };
  }

  // 4. Check for uncommitted changes
  try {
    const status = execSync('git status --porcelain', {
      cwd: pane.worktreePath,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    if (status) {
      // Auto-commit changes
      return {
        type: 'confirm',
        title: 'Uncommitted Changes',
        message: `There are uncommitted changes. Commit them before opening PR?`,
        confirmLabel: 'Commit & Continue',
        cancelLabel: 'Cancel',
        onConfirm: async () => {
          // Generate commit message and commit
          const commitMsg = await generateCommitMessage(pane.worktreePath!);
          const finalMsg = commitMsg || `chore: prepare ${branch} for PR`;

          try {
            execSync('git add -A', { cwd: pane.worktreePath!, stdio: 'pipe' });
            execSync(`git commit -m "${finalMsg.replace(/"/g, '\\"')}"`, {
              cwd: pane.worktreePath!,
              stdio: 'pipe',
            });
          } catch (error: any) {
            return {
              type: 'error',
              message: `Failed to commit: ${error.message}`,
              dismissable: true,
            };
          }

          // Continue with PR creation
          return createPrFlow(pane, context, mainRepoPath, branch, mainBranch);
        },
      };
    }
  } catch {}

  // No uncommitted changes, proceed directly
  return createPrFlow(pane, context, mainRepoPath, branch, mainBranch);
}

async function createPrFlow(
  pane: DmuxPane,
  context: ActionContext,
  mainRepoPath: string,
  branch: string,
  baseBranch: string,
): Promise<ActionResult> {
  const logger = LogService.getInstance();

  // 1. Push branch
  const pushResult = await pushBranch(pane.worktreePath!, branch);
  if (!pushResult.success) {
    return {
      type: 'error',
      message: `Failed to push: ${pushResult.error}`,
      dismissable: true,
    };
  }

  // 2. Generate PR description (v1)
  let { title: finalTitle, body: finalBody } = await generatePrDescription({
    panePrompt: pane.prompt,
    branch,
    cwd: pane.worktreePath!,
    projectRoot: mainRepoPath,
  });

  // 3. Trigger pre_pr hook (blocking, 10 min timeout for AI review)
  const hookResult = await triggerHookSync('pre_pr', mainRepoPath, pane, {
    DMUX_PR_TITLE: finalTitle,
    DMUX_PR_BODY: finalBody,
    DMUX_BASE_BRANCH: baseBranch,
  }, 600000);
  if (!hookResult.success) {
    return {
      type: 'error',
      message: `pre_pr hook failed: ${hookResult.error}`,
      dismissable: true,
    };
  }

  // 4. Check if hook made new commits (review fixes)
  try {
    const newCommits = execSync(`git log origin/${branch}..${branch} --oneline`, {
      cwd: pane.worktreePath!,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    if (newCommits) {
      logger.debug(`pre_pr hook created new commits:\n${newCommits}`, 'openPr');

      // 4a. Re-push with the new commits
      const rePushResult = await pushBranch(pane.worktreePath!, branch);
      if (!rePushResult.success) {
        return {
          type: 'error',
          message: `Failed to push review fixes: ${rePushResult.error}`,
          dismissable: true,
        };
      }

      // 4b. Re-generate PR description (v2 includes the fixes)
      const updated = await generatePrDescription({
        panePrompt: pane.prompt,
        branch,
        cwd: pane.worktreePath!,
        projectRoot: mainRepoPath,
      });
      finalTitle = updated.title;
      finalBody = updated.body;
    }
  } catch {
    // If git log fails (e.g., branch not on remote yet), just continue
  }

  // 5. Create PR
  const prResult = await createPr({
    cwd: mainRepoPath,
    title: finalTitle,
    body: finalBody,
    base: baseBranch,
    head: branch,
  });

  if (!prResult.success) {
    return {
      type: 'error',
      message: `Failed to create PR: ${prResult.error}`,
      dismissable: true,
    };
  }

  // 6. Update pane data with PR info
  const updatedPanes = context.panes.map(p => {
    if (p.id === pane.id) {
      return {
        ...p,
        prNumber: prResult.prNumber,
        prUrl: prResult.prUrl,
        prStatus: 'open' as const,
      } as DmuxPane;
    }
    return p;
  });
  await context.savePanes(updatedPanes);

  // 7. Trigger post_pr hook (async, non-blocking)
  triggerHook('post_pr', mainRepoPath, pane, {
    DMUX_PR_NUMBER: String(prResult.prNumber || ''),
    DMUX_PR_URL: prResult.prUrl || '',
  });

  // 8. Return success
  return {
    type: 'success',
    message: `PR #${prResult.prNumber} created: ${prResult.prUrl}`,
    data: { prNumber: prResult.prNumber, prUrl: prResult.prUrl },
  };
}
