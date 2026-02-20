import { spawn } from 'child_process';
import type { DmuxPane } from '../types.js';
import { triggerHook } from '../utils/hooks.js';
import { LogService } from './LogService.js';

interface WorktreeCleanupJob {
  pane: DmuxPane;
  paneProjectRoot: string;
  mainRepoPath: string;
  deleteBranch: boolean;
}

interface CommandResult {
  success: boolean;
  error?: string;
}

/**
 * Queues worktree deletions in the background so large filesystem cleanup
 * never blocks the main dmux event loop.
 */
export class WorktreeCleanupService {
  private static instance: WorktreeCleanupService;
  private cleanupQueue: Promise<void> = Promise.resolve();
  private logger = LogService.getInstance();

  static getInstance(): WorktreeCleanupService {
    if (!WorktreeCleanupService.instance) {
      WorktreeCleanupService.instance = new WorktreeCleanupService();
    }
    return WorktreeCleanupService.instance;
  }

  enqueueCleanup(job: WorktreeCleanupJob): void {
    if (!job.pane.worktreePath) {
      return;
    }

    this.cleanupQueue = this.cleanupQueue
      .then(() => this.runCleanup(job))
      .catch((error) => {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Background worktree cleanup failed for ${job.pane.slug}: ${errorObj.message}`,
          'paneActions',
          job.pane.id,
          errorObj
        );
      });
  }

  private async runCleanup(job: WorktreeCleanupJob): Promise<void> {
    const { pane, paneProjectRoot, mainRepoPath, deleteBranch } = job;
    if (!pane.worktreePath) {
      return;
    }

    this.logger.debug(
      `Starting background worktree cleanup for ${pane.slug}`,
      'paneActions',
      pane.id
    );

    const removeResult = await this.runGitCommand(
      ['worktree', 'remove', pane.worktreePath, '--force'],
      mainRepoPath
    );

    if (!removeResult.success) {
      this.logger.warn(
        `Worktree removal reported an error for ${pane.slug}: ${removeResult.error}`,
        'paneActions',
        pane.id
      );
    }

    // The hook should run after deletion is attempted, regardless of outcome.
    await triggerHook('worktree_removed', paneProjectRoot, pane);

    if (deleteBranch) {
      const deleteBranchResult = await this.runGitCommand(
        ['branch', '-D', pane.slug],
        mainRepoPath
      );

      if (!deleteBranchResult.success) {
        this.logger.warn(
          `Branch deletion reported an error for ${pane.slug}: ${deleteBranchResult.error}`,
          'paneActions',
          pane.id
        );
      }
    }

    this.logger.debug(
      `Finished background worktree cleanup for ${pane.slug}`,
      'paneActions',
      pane.id
    );
  }

  private runGitCommand(args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
          return;
        }

        resolve({
          success: false,
          error:
            stderr.trim() ||
            `git ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`,
        });
      });
    });
  }
}
