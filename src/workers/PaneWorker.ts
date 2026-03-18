import { parentPort, workerData } from 'worker_threads';
import { randomUUID } from 'crypto';
import { capturePaneContent } from '../utils/paneCapture.js';
import { TmuxService } from '../services/TmuxService.js';
import type { AgentName } from '../utils/agentLaunch.js';
import {
  buildPaneActivityFingerprint,
  hasAgentWorkingIndicators,
  isLikelyUserTyping,
} from '../utils/paneAttentionHeuristics.js';
import type {
  WorkerConfig,
  InboundMessage,
  OutboundMessage,
  StatusChangePayload,
  AnalysisNeededPayload,
  ErrorPayload,
  UserInteractionPayload,
} from './WorkerMessages.js';

class PaneWorker {
  private static readonly CAPTURE_LINE_COUNT = 50;
  private static readonly USER_TYPING_SETTLE_MS = 3500;
  private static readonly AGENT_ACTIVITY_SETTLE_MS = 1500;

  private paneId: string;
  private tmuxPaneId: string;
  private agent?: AgentName;
  private captureHistory: Array<{ raw: string; fingerprint: string }> = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private currentStatus: 'idle' | 'analyzing' | 'waiting' | 'working' = 'idle';
  private lastStaticContent: string = '';
  private lastStaticFingerprint: string = '';
  private lastAnalysisTime: number = 0;
  private isShuttingDown: boolean = false;
  private settledStateConfirmed: boolean = false; // Block repeated LLM requests until activity resumes
  private lastUserInteractionAt: number = 0;
  private lastAgentActivityAt: number = 0;
  private awaitingAgentAfterUserInteraction: boolean = false;
  private statusBeforeAnalyzing: 'idle' | 'waiting' | 'working' = 'idle';
  private tmux = TmuxService.getInstance();

  constructor(config: WorkerConfig) {
    this.paneId = config.paneId;
    this.tmuxPaneId = config.tmuxPaneId;
    this.agent = config.agent;
    this.pollIntervalMs = config.pollInterval || 1000;

    this.setupMessageHandler();
    this.startPolling();
    this.emit('ready', {});
  }

  private setupMessageHandler(): void {
    if (!parentPort) return;

    parentPort.on('message', async (msg: InboundMessage) => {
      if (this.isShuttingDown) return;

      try {
        switch (msg.type) {
          case 'send-keys':
            await this.sendKeys(msg.payload?.keys);
            this.reply(msg, { success: true });
            break;

          case 'resize':
            await this.resizePane(msg.payload?.width, msg.payload?.height);
            this.reply(msg, { success: true });
            break;

          case 'analyze-complete':
            this.handleAnalysisComplete(msg.payload);
            this.reply(msg, { success: true });
            break;

          case 'get-status':
            this.reply(msg, { status: this.currentStatus });
            break;

          case 'shutdown':
            this.shutdown();
            break;

          default:
            this.reply(msg, { error: `Unknown message type: ${msg.type}` });
        }
      } catch (error: any) {
        this.emitError(`Handler error: ${error.message}`, true);
      }
    });
  }

  private startPolling(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.captureAndAnalyze();
      }
    }, this.pollIntervalMs);
  }

  private captureAndAnalyze(): void {
    try {
      // Capture a stable slice of recent pane history for both activity detection
      // and downstream analysis.
      const output = capturePaneContent(this.tmuxPaneId, PaneWorker.CAPTURE_LINE_COUNT);
      const activityFingerprint = buildPaneActivityFingerprint(output);
      const now = Date.now();

      const lines = output.split('\n');
      const recentLines = lines.slice(-20).join('\n');
      const hasWorkingState = hasAgentWorkingIndicators(recentLines, this.agent);

      if (hasWorkingState) {
        this.markAgentActive(output, activityFingerprint, now);
        return;
      }

      // Add to rolling history
      this.captureHistory.push({
        raw: output,
        fingerprint: activityFingerprint,
      });
      if (this.captureHistory.length > 5) {
        this.captureHistory.shift();
      }

      // Need at least 3 captures to determine activity
      if (this.captureHistory.length < 3) {
        return;
      }

      // Check for activity (any changes in captures)
      const hasActivity = !this.captureHistory.every(
        capture => capture.fingerprint === this.captureHistory[0]?.fingerprint
      );

      if (hasActivity) {
        const previousCapture = this.captureHistory[this.captureHistory.length - 2]?.raw || '';
        if (isLikelyUserTyping(previousCapture, output)) {
          this.handleUserInteraction(output, activityFingerprint, now);
          return;
        }

        this.markAgentActive(output, activityFingerprint, now);
      } else {
        // Terminal is static - determine what kind
        const staticCapture = this.captureHistory[this.captureHistory.length - 1];
        const staticContent = staticCapture?.raw || '';
        const staticFingerprint = staticCapture?.fingerprint || '';
        if (now - this.lastUserInteractionAt < PaneWorker.USER_TYPING_SETTLE_MS) {
          return;
        }

        if (now - this.lastAgentActivityAt < PaneWorker.AGENT_ACTIVITY_SETTLE_MS) {
          return;
        }

        if (this.awaitingAgentAfterUserInteraction) {
          return;
        }

        // Check if this is new static content
        if (staticFingerprint !== this.lastStaticFingerprint) {
          this.lastStaticContent = staticContent;
          this.lastStaticFingerprint = staticFingerprint;

          if (this.settledStateConfirmed) {
            return;
          }

          // Don't request analysis if we're too soon after last one
          const timeSinceLastAnalysis = Date.now() - this.lastAnalysisTime;
          if (timeSinceLastAnalysis < 5000) {
            // Too soon, keep current status
            return;
          }

          // Request LLM analysis for new static content
          if (this.currentStatus !== 'analyzing') {
            this.transitionToAnalyzing(staticContent, 'new-static-content');
          }
        }
        // If same static content, keep current status
      }
    } catch (error: any) {
      // Handle tmux errors gracefully
      if (error.message?.includes("can't find pane") || error.message?.includes('no pane')) {
        // Pane no longer exists - emit pane-removed event and shutdown
        this.emit('pane-removed', { reason: 'Pane no longer exists' });
        this.shutdown();
      } else {
        this.emitError(`Capture error: ${error.message}`, true);
      }
    }
  }

  private markAgentActive(output: string, fingerprint: string, at: number): void {
    this.awaitingAgentAfterUserInteraction = false;
    this.settledStateConfirmed = false;
    this.lastAgentActivityAt = at;
    this.lastStaticContent = '';
    this.lastStaticFingerprint = '';

    if (this.currentStatus !== 'working') {
      this.updateStatus('working');
    }

    this.captureHistory = [{ raw: output, fingerprint }];
  }

  private handleUserInteraction(output: string, fingerprint: string, at: number): void {
    this.lastUserInteractionAt = at;
    this.awaitingAgentAfterUserInteraction = true;
    this.settledStateConfirmed = false;
    this.lastStaticContent = output;
    this.lastStaticFingerprint = fingerprint;
    this.captureHistory = [{ raw: output, fingerprint }];

    if (this.currentStatus === 'analyzing') {
      this.updateStatus(this.statusBeforeAnalyzing);
    }

    this.emitUserInteraction(output);
  }

  private updateStatus(newStatus: 'idle' | 'analyzing' | 'waiting' | 'working'): void {
    const previousStatus = this.currentStatus;
    this.currentStatus = newStatus;

    const payload: StatusChangePayload = {
      status: newStatus,
      previousStatus,
      captureSnapshot: this.captureHistory[this.captureHistory.length - 1]?.raw
    };

    this.emit('status-change', payload);
  }

  private requestAnalysis(content: string, reason: 'new-static-content' | 'revalidation'): void {
    this.lastAnalysisTime = Date.now();

    const payload: AnalysisNeededPayload = {
      captureSnapshot: content,
      reason
    };

    this.emit('analysis-needed', payload);
  }

  private transitionToAnalyzing(
    content: string,
    reason: 'new-static-content' | 'revalidation'
  ): void {
    this.statusBeforeAnalyzing = this.currentStatus === 'analyzing'
      ? this.statusBeforeAnalyzing
      : this.currentStatus;
    this.updateStatus('analyzing');
    this.requestAnalysis(content, reason);
  }

  private handleAnalysisComplete(payload: any): void {
    if (payload?.status) {
      this.updateStatus(payload.status);
      this.settledStateConfirmed = payload.status === 'idle' || payload.status === 'waiting';

      // If a delay was requested (e.g., after option dialog), pause polling temporarily
      if (payload.delayBeforeNextCheck && payload.delayBeforeNextCheck > 0) {
        this.pausePolling(payload.delayBeforeNextCheck);
      }
    }
  }

  private pausePolling(delayMs: number): void {
    // Stop the current interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Restart polling after the delay
    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.startPolling();
      }
    }, delayMs);
  }

  private async sendKeys(keys: string): Promise<void> {
    if (!keys) return;

    // Escape single quotes in keys
    const escapedKeys = keys.replace(/'/g, "'\\''");
    await this.tmux.sendKeys(this.tmuxPaneId, `'${escapedKeys}'`);

    // Clear history after sending keys as state will change
    this.captureHistory = [];
    this.lastStaticFingerprint = '';
    this.handleUserInteraction('', '', Date.now());
  }

  private async resizePane(width?: number, height?: number): Promise<void> {
    if (!width && !height) return;

    await this.tmux.resizePane(this.tmuxPaneId, { width, height });

    // Refresh to ensure pane is painted correctly after resize
    await this.tmux.refreshClient();
  }

  private shutdown(): void {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.emit('shutdown-complete', {});

    // Give time for message to send
    setTimeout(() => {
      process.exit(0);
    }, 100);
  }

  private reply(originalMsg: InboundMessage, payload: any): void {
    this.emitMessage({
      id: originalMsg.id,
      type: `${originalMsg.type}-response` as any,
      timestamp: Date.now(),
      paneId: this.paneId,
      payload
    });
  }

  private emit(type: OutboundMessage['type'], payload?: any): void {
    this.emitMessage({
      id: randomUUID(),
      type,
      timestamp: Date.now(),
      paneId: this.paneId,
      payload
    });
  }

  private emitUserInteraction(captureSnapshot?: string): void {
    const payload: UserInteractionPayload = {};
    if (captureSnapshot) {
      payload.captureSnapshot = captureSnapshot;
    }
    this.emit('user-interaction', payload);
  }

  private emitMessage(message: OutboundMessage): void {
    if (parentPort && !this.isShuttingDown) {
      parentPort.postMessage(message);
    }
  }

  private emitError(error: string, recoverable: boolean): void {
    const payload: ErrorPayload = {
      error,
      recoverable
    };
    this.emit('error', payload);
  }
}

// Initialize worker with config from main thread
if (workerData) {
  new PaneWorker(workerData as WorkerConfig);
}
