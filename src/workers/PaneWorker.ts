import { parentPort, workerData } from 'worker_threads';
import { randomUUID } from 'crypto';
import { capturePaneContent } from '../utils/paneCapture.js';
import { TmuxService } from '../services/TmuxService.js';
import type {
  WorkerConfig,
  InboundMessage,
  OutboundMessage,
  StatusChangePayload,
  AnalysisNeededPayload,
  ErrorPayload
} from './WorkerMessages.js';

class PaneWorker {
  private paneId: string;
  private tmuxPaneId: string;
  private agent?: 'claude' | 'opencode' | 'codex' | 'pi';
  private captureHistory: string[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private currentStatus: 'idle' | 'analyzing' | 'waiting' | 'working' = 'idle';
  private lastStaticContent: string = '';
  private lastAnalysisTime: number = 0;
  private isShuttingDown: boolean = false;
  private idleConfirmed: boolean = false; // Block LLM requests when idle is confirmed
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
      // Capture last 30 lines from tmux pane (skipping trailing blanks)
      const output = capturePaneContent(this.tmuxPaneId, 30);

      // First check for deterministic agent working indicators
      // Check the last 20 lines - enough to catch working state but avoid old output
      const lines = output.split('\n');
      const recentLines = lines.slice(-20).join('\n');
      const hasWorkingIndicators = this.hasAgentWorkingIndicators(recentLines);

      if (hasWorkingIndicators) {
        // Reset idle confirmation - working state always breaks out of idle
        this.idleConfirmed = false;

        if (this.currentStatus !== 'working') {
          this.updateStatus('working');
        }
        // Clear history when agent starts working
        this.captureHistory = [output];
        this.lastStaticContent = '';
        return;
      } else if (this.currentStatus === 'working') {
        // Was working but no longer has indicators - agent stopped
        // Request analysis to determine new state
        this.updateStatus('analyzing');
        this.requestAnalysis(output, 'new-static-content');
        // Reset history for fresh tracking
        this.captureHistory = [output];
        this.lastStaticContent = '';
        return;
      }

      // Add to rolling history
      this.captureHistory.push(output);
      if (this.captureHistory.length > 5) {
        this.captureHistory.shift();
      }

      // Need at least 3 captures to determine activity
      if (this.captureHistory.length < 3) {
        return;
      }

      // Check for activity (any changes in captures)
      const hasActivity = !this.captureHistory.every(
        capture => capture === this.captureHistory[0]
      );

      if (hasActivity) {
        // Check if this is user typing vs agent output
        if (this.isUserTyping()) {
          // User is typing - maintain current status
          // Don't change status or request analysis
          return;
        }

        // If we're in confirmed idle state, don't request more LLM analysis
        // until we see working indicators (which reset the block)
        if (this.idleConfirmed) {
          return;
        }

        // Significant changes that aren't user typing
        // Could be agent output or major state change
        // Request LLM analysis to determine state
        if (this.currentStatus !== 'analyzing') {
          this.updateStatus('analyzing');
          this.requestAnalysis(output, 'new-static-content');
        }
      } else {
        // Terminal is static - determine what kind
        const staticContent = this.captureHistory[this.captureHistory.length - 1];

        // Check if this is new static content
        if (staticContent !== this.lastStaticContent) {
          this.lastStaticContent = staticContent;

          // If we're in confirmed idle state, don't request more LLM analysis
          if (this.idleConfirmed) {
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
            this.updateStatus('analyzing');
            this.requestAnalysis(staticContent, 'new-static-content');
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

  private updateStatus(newStatus: 'idle' | 'analyzing' | 'waiting' | 'working'): void {
    const previousStatus = this.currentStatus;
    this.currentStatus = newStatus;

    const payload: StatusChangePayload = {
      status: newStatus,
      previousStatus,
      captureSnapshot: this.captureHistory[this.captureHistory.length - 1]
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

  private handleAnalysisComplete(payload: any): void {
    if (payload?.status) {
      this.updateStatus(payload.status);
      // If LLM determined it's idle, confirm it to block future requests
      if (payload.status === 'idle') {
        this.idleConfirmed = true;
      }

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

  /**
   * Check for deterministic indicators that agent is working
   */
  private hasAgentWorkingIndicators(content: string): boolean {
    // The most reliable indicator for both agents is "esc to interrupt"
    // This ONLY appears when the agent is actively processing
    // Match "(esc to interrupt" at the beginning, but allow additional text after like timing info
    const universalWorkingPattern = /\(esc\s+to\s+interrupt/i;

    if (universalWorkingPattern.test(content)) {
      return true;
    }

    // Additional agent-specific patterns that are very specific
    if (this.agent === 'claude') {
      // Claude shows specific animations when working
      // Look for the germinating/thinking messages WITH esc to interrupt nearby
      // Allow for additional text after "interrupt" like timing info
      const claudeActivePatterns = [
        /·\s+(Germinating|Thinking|Planning|Writing|Reading|Analyzing|Building|Testing|Running|Searching|Reviewing|Understanding)[.…]+\s*\(esc\s+to\s+interrupt/i,
        /⏸\s*Claude\s+is\s+working.*\(esc\s+to\s+interrupt/i
      ];
      return claudeActivePatterns.some(pattern => pattern.test(content));
    } else if (this.agent === 'opencode') {
      // OpenCode specific working indicators
      const opencodeWorkingPatterns = [
        /working\.\.\./i,
        /⏳.*processing/i
      ];
      return opencodeWorkingPatterns.some(pattern => pattern.test(content));
    }

    return false;
  }

  /**
   * Detect if changes are likely user typing at a prompt
   */
  private isUserTyping(): boolean {
    if (this.captureHistory.length < 2) return false;

    const prev = this.captureHistory[this.captureHistory.length - 2];
    const curr = this.captureHistory[this.captureHistory.length - 1];

    // Split into lines
    const prevLines = prev.split('\n');
    const currLines = curr.split('\n');

    // If line count changed significantly, probably not typing
    if (Math.abs(currLines.length - prevLines.length) > 2) {
      return false;
    }

    // Check if only the last few lines changed (typical of user input)
    let changedLines = 0;
    let lastChangedIndex = -1;

    for (let i = 0; i < Math.min(prevLines.length, currLines.length); i++) {
      if (prevLines[i] !== currLines[i]) {
        changedLines++;
        lastChangedIndex = i;
      }
    }

    // User typing typically only changes the last 1-2 lines
    // and the change is at the bottom of the terminal
    if (changedLines <= 2 && lastChangedIndex >= prevLines.length - 3) {
      // Additional check: is the change small (adding characters)?
      if (lastChangedIndex >= 0) {
        const prevLine = prevLines[lastChangedIndex] || '';
        const currLine = currLines[lastChangedIndex] || '';

        // Check if current line starts with previous line (user adding to it)
        if (currLine.startsWith(prevLine) && currLine.length - prevLine.length < 20) {
          return true;
        }

        // Check for common prompt patterns with user input
        const promptPatterns = [
          />\s*\S+/,        // > command
          /\$\s*\S+/,       // $ command
          /❯\s*\S+/,        // ❯ command
          /│\s*>\s*\S+/,   // │ > input (Claude prompt)
        ];

        if (promptPatterns.some(p => p.test(currLine))) {
          return true;
        }
      }
    }

    return false;
  }
}

// Initialize worker with config from main thread
if (workerData) {
  new PaneWorker(workerData as WorkerConfig);
}