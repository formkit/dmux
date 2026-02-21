import { LogService } from './LogService.js';
import type { DmuxPane } from '../types.js';
import { getPrStatus, getPrChecks, isGhAvailable } from '../utils/ghCli.js';
import { triggerHook } from '../utils/hooks.js';

/**
 * Polls PR status for panes that have an open PR.
 * Updates pane data and triggers hooks on status changes.
 */
export class PrStatusPoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private consecutiveErrors = 0;
  private maxConsecutiveErrors = 5;
  private basePollIntervalMs = 30000; // 30 seconds

  private getPanes: () => DmuxPane[];
  private savePanes: (panes: DmuxPane[]) => Promise<void>;
  private projectRoot: string;

  constructor(options: {
    getPanes: () => DmuxPane[];
    savePanes: (panes: DmuxPane[]) => Promise<void>;
    projectRoot: string;
  }) {
    this.getPanes = options.getPanes;
    this.savePanes = options.savePanes;
    this.projectRoot = options.projectRoot;
  }

  /**
   * Start polling
   */
  async start(): Promise<void> {
    const logger = LogService.getInstance();

    // Check if gh is available
    if (!(await isGhAvailable())) {
      logger.debug('PrStatusPoller: gh CLI not available, not starting', 'prPoller');
      return;
    }

    logger.debug('PrStatusPoller: Starting', 'prPoller');
    this.schedulePoll();
  }

  /**
   * Schedule next poll with exponential backoff on errors
   */
  private schedulePoll(): void {
    const delay = this.consecutiveErrors > 0
      ? Math.min(this.basePollIntervalMs * Math.pow(2, this.consecutiveErrors), 300000) // Max 5 min
      : this.basePollIntervalMs;

    this.pollInterval = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, delay);
  }

  /**
   * Poll all panes with PRs
   */
  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    const logger = LogService.getInstance();

    try {
      const panes = this.getPanes();
      const panesWithPr = panes.filter(p => p.prNumber && p.prStatus !== 'merged' && p.prStatus !== 'closed');

      if (panesWithPr.length === 0) {
        this.isPolling = false;
        return;
      }

      logger.debug(`PrStatusPoller: Checking ${panesWithPr.length} PR(s)`, 'prPoller');

      let updated = false;
      const updatedPanes = [...panes];

      for (const pane of panesWithPr) {
        if (!pane.prNumber || !pane.worktreePath) continue;

        const mainRepoPath = pane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');

        // Get PR status
        const prStatus = await getPrStatus(mainRepoPath, pane.prNumber);
        if (prStatus) {
          const newStatus = prStatus.state === 'MERGED' ? 'merged'
            : prStatus.state === 'CLOSED' ? 'closed'
            : prStatus.isDraft ? 'draft'
            : 'open';

          if (newStatus !== pane.prStatus) {
            logger.info(`PrStatusPoller: PR #${pane.prNumber} status changed: ${pane.prStatus} → ${newStatus}`, 'prPoller');
            const idx = updatedPanes.findIndex(p => p.id === pane.id);
            if (idx >= 0) {
              updatedPanes[idx] = { ...updatedPanes[idx], prStatus: newStatus as any, prLastChecked: Date.now() };
              updated = true;
            }
          }
        }

        // Get CI checks
        const prChecks = await getPrChecks(mainRepoPath, pane.prNumber);
        if (prChecks) {
          const prevOverall = pane.prChecks?.overall;

          const idx = updatedPanes.findIndex(p => p.id === pane.id);
          if (idx >= 0) {
            updatedPanes[idx] = {
              ...updatedPanes[idx],
              prChecks: prChecks as any,
              prLastChecked: Date.now(),
            };
            updated = true;
          }

          // Trigger hook if CI status changed
          if (prevOverall && prevOverall !== prChecks.overall) {
            triggerHook('post_ci_check', this.projectRoot, pane, {
              DMUX_PR_NUMBER: String(pane.prNumber),
              DMUX_CI_STATUS: prChecks.overall,
            });
          }
        }
      }

      if (updated) {
        await this.savePanes(updatedPanes);
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.consecutiveErrors++;
      logger.error(`PrStatusPoller: Error: ${error}`, 'prPoller');
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
