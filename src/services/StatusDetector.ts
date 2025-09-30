import { EventEmitter } from 'events';
import type { DmuxPane, AgentStatus } from '../types.js';
import { WorkerMessageBus } from './WorkerMessageBus.js';
import { PaneWorkerManager } from './PaneWorkerManager.js';
import { PaneAnalyzer } from '../PaneAnalyzer.js';
import type { OutboundMessage } from '../workers/WorkerMessages.js';

export interface StatusUpdateEvent {
  paneId: string;
  status: AgentStatus;
  previousStatus?: AgentStatus;
}

/**
 * High-level service coordinating status detection via workers and LLM
 */
export class StatusDetector extends EventEmitter {
  private workerManager: PaneWorkerManager;
  private messageBus: WorkerMessageBus;
  private paneAnalyzer: PaneAnalyzer;
  private paneStatuses = new Map<string, AgentStatus>();
  private llmRequests = new Map<string, AbortController>();
  private paneIdMap = new Map<string, string>(); // dmux pane ID -> tmux pane ID
  private isShuttingDown = false;

  constructor() {
    super();
    this.messageBus = new WorkerMessageBus();
    this.workerManager = new PaneWorkerManager(this.messageBus);
    this.paneAnalyzer = new PaneAnalyzer();

    this.setupMessageHandlers();
  }

  /**
   * Set up handlers for worker messages
   */
  private setupMessageHandlers(): void {
    // Handle status changes from workers
    this.messageBus.subscribe('status-change', async (paneId, message) => {
      await this.handleStatusChange(paneId, message);
    });

    // Handle analysis requests from workers
    this.messageBus.subscribe('analysis-needed', async (paneId, message) => {
      await this.handleAnalysisRequest(paneId, message);
    });

    // Handle worker errors
    this.messageBus.subscribe('error', (paneId, message) => {
      console.error(`Worker error for pane ${paneId}:`, message.payload);
    });

    // Handle worker ready events
    this.messageBus.subscribe('ready', (paneId) => {
      console.log(`Worker ready for pane ${paneId}`);
    });
  }

  /**
   * Start monitoring a set of panes
   */
  async monitorPanes(panes: DmuxPane[]): Promise<void> {
    if (this.isShuttingDown) return;

    // Update pane ID mappings
    panes.forEach(pane => {
      if (pane.id && pane.paneId) {
        this.paneIdMap.set(pane.id, pane.paneId);
      }
    });

    // Update workers based on current panes
    await this.workerManager.updateWorkers(panes);
  }

  /**
   * Handle status change from worker
   */
  private async handleStatusChange(
    paneId: string,
    message: OutboundMessage
  ): Promise<void> {
    const { status, previousStatus } = message.payload || {};

    if (!status) return;

    // Update local cache
    const oldStatus = this.paneStatuses.get(paneId);
    this.paneStatuses.set(paneId, status);

    // If changing away from analyzing, cancel any pending LLM request
    if (oldStatus === 'analyzing' && status !== 'analyzing') {
      this.cancelLLMRequest(paneId);
    }

    // Emit event for UI updates
    this.emit('status-updated', {
      paneId,
      status,
      previousStatus: oldStatus
    } as StatusUpdateEvent);
  }

  /**
   * Handle analysis request from worker
   */
  private async handleAnalysisRequest(
    paneId: string,
    message: OutboundMessage
  ): Promise<void> {
    const { captureSnapshot, reason } = message.payload || {};

    if (!captureSnapshot) return;

    // Cancel any existing request for this pane
    this.cancelLLMRequest(paneId);

    // Set status to analyzing
    this.paneStatuses.set(paneId, 'analyzing');
    this.emit('status-updated', {
      paneId,
      status: 'analyzing'
    } as StatusUpdateEvent);

    try {
      // Create abort controller for this request
      const controller = new AbortController();
      this.llmRequests.set(paneId, controller);

      // Get the tmux pane ID (we need to track this better)
      const tmuxPaneId = await this.getTmuxPaneId(paneId);
      if (!tmuxPaneId) {
        throw new Error(`No tmux pane ID found for ${paneId}`);
      }

      // Run LLM analysis
      const analysis = await this.paneAnalyzer.analyzePane(tmuxPaneId);

      // Check if request was cancelled
      if (controller.signal.aborted) {
        return;
      }

      // Determine final status based on analysis
      const finalStatus: AgentStatus =
        analysis.state === 'option_dialog' ? 'waiting' : 'idle';

      // Update status
      this.paneStatuses.set(paneId, finalStatus);

      // Notify worker of analysis result (fire and forget)
      this.workerManager.notifyWorker(paneId, {
        type: 'analyze-complete',
        timestamp: Date.now(),
        payload: {
          status: finalStatus,
          analysis
        }
      });

      // Emit event for UI
      this.emit('status-updated', {
        paneId,
        status: finalStatus,
        previousStatus: 'analyzing'
      } as StatusUpdateEvent);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was cancelled
        return;
      }

      console.error(`LLM analysis error for pane ${paneId}:`, error);

      // Default to idle on error
      this.paneStatuses.set(paneId, 'idle');
      this.emit('status-updated', {
        paneId,
        status: 'idle',
        previousStatus: 'analyzing'
      } as StatusUpdateEvent);
    } finally {
      this.llmRequests.delete(paneId);
    }
  }

  /**
   * Cancel LLM request for a pane
   */
  private cancelLLMRequest(paneId: string): void {
    const controller = this.llmRequests.get(paneId);
    if (controller) {
      controller.abort();
      this.llmRequests.delete(paneId);
    }
  }

  /**
   * Get tmux pane ID for a dmux pane
   */
  private async getTmuxPaneId(paneId: string): Promise<string | null> {
    return this.paneIdMap.get(paneId) || null;
  }

  /**
   * Get current status for a pane
   */
  getStatus(paneId: string): AgentStatus | undefined {
    return this.paneStatuses.get(paneId);
  }

  /**
   * Get all statuses
   */
  getAllStatuses(): Map<string, AgentStatus> {
    return new Map(this.paneStatuses);
  }

  /**
   * Send keys to a pane (future feature)
   */
  async sendKeysToPane(paneId: string, keys: string): Promise<void> {
    return this.workerManager.sendToWorker(paneId, {
      type: 'send-keys',
      timestamp: Date.now(),
      payload: { keys }
    }).then(() => {});
  }

  /**
   * Resize a pane (future feature)
   */
  async resizePane(
    paneId: string,
    width?: number,
    height?: number
  ): Promise<void> {
    return this.workerManager.sendToWorker(paneId, {
      type: 'resize',
      timestamp: Date.now(),
      payload: { width, height }
    }).then(() => {});
  }

  /**
   * Get statistics
   */
  getStats(): {
    workerStats: ReturnType<PaneWorkerManager['getStats']>;
    messageBusStats: ReturnType<WorkerMessageBus['getStats']>;
    statusCounts: Record<AgentStatus, number>;
    llmRequestsInFlight: number;
  } {
    const statusCounts: Record<AgentStatus, number> = {
      idle: 0,
      analyzing: 0,
      waiting: 0,
      working: 0
    };

    this.paneStatuses.forEach(status => {
      statusCounts[status]++;
    });

    return {
      workerStats: this.workerManager.getStats(),
      messageBusStats: this.messageBus.getStats(),
      statusCounts,
      llmRequestsInFlight: this.llmRequests.size
    };
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel all LLM requests
    this.llmRequests.forEach(controller => controller.abort());
    this.llmRequests.clear();

    // Shutdown workers
    await this.workerManager.shutdown();

    // Clean up message bus
    this.messageBus.destroy();

    // Clear state
    this.paneStatuses.clear();
    this.paneIdMap.clear();

    // Remove all listeners
    this.removeAllListeners();
  }
}

// Export singleton instance
let instance: StatusDetector | null = null;

export function getStatusDetector(): StatusDetector {
  if (!instance) {
    instance = new StatusDetector();
  }
  return instance;
}

export function resetStatusDetector(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}