import { EventEmitter } from 'events';
import { Readable } from 'stream';
import type { DmuxPane, ProjectSettings } from '../types.js';
import StateManager from '../shared/StateManager.js';

// Helper to format pane response (same as routes.ts)
function formatPaneResponse(pane: DmuxPane) {
  return {
    id: pane.id,
    slug: pane.slug,
    prompt: pane.prompt,
    paneId: pane.paneId,
    worktreePath: pane.worktreePath,
    agent: pane.agent || 'unknown',
    agentStatus: pane.agentStatus || 'idle',
    testStatus: pane.testStatus,
    testWindowId: pane.testWindowId,
    devStatus: pane.devStatus,
    devUrl: pane.devUrl,
    devWindowId: pane.devWindowId,
    lastAgentCheck: pane.lastAgentCheck,
    optionsQuestion: pane.optionsQuestion,
    options: pane.options,
    potentialHarm: pane.potentialHarm,
    agentSummary: pane.agentSummary
  };
}

// Stream interface - using Node.js Readable stream (same as TerminalStreamer)
type StreamClient = Readable;

// Helper to format messages using TYPE:JSON\n protocol (same as terminal streaming)
function formatMessage(message: any): string {
  const type = message.type.toUpperCase();
  return `${type}:${JSON.stringify(message)}\n`;
}

interface PanesStreamInfo {
  clients: Set<StreamClient>;
  lastState: {
    panes: DmuxPane[];
    projectName: string;
    sessionName: string;
    settings: ProjectSettings;
  };
  heartbeatInterval?: NodeJS.Timeout;
  stateSubscription?: () => void;
  isActive: boolean;
}

/**
 * Manages real-time streaming of panes data to browser clients
 * Uses the same streaming protocol as TerminalStreamer for consistency
 */
export class PanesStreamer extends EventEmitter {
  private stream: PanesStreamInfo | null = null;
  private isShuttingDown = false;
  private stateManager = StateManager;

  /**
   * Start streaming panes data to a client
   */
  async startStream(client: StreamClient): Promise<void> {
    if (this.isShuttingDown) return;

    // Get or create stream info
    if (!this.stream) {
      this.stream = await this.initializeStream();
    }

    // Add client to stream
    this.stream.clients.add(client);

    // Send initial state to new client
    await this.sendInitialState(this.stream, client);

    // If first client, start the streaming
    if (this.stream.clients.size === 1 && !this.stream.isActive) {
      await this.activateStream(this.stream);
    }
  }

  /**
   * Stop streaming to a specific client
   */
  stopStream(client: StreamClient): void {
    if (!this.stream) return;

    // Remove client
    this.stream.clients.delete(client);

    // If no more clients, deactivate stream
    if (this.stream.clients.size === 0) {
      this.deactivateStream(this.stream);
      this.stream = null;
    }
  }

  /**
   * Initialize stream info
   */
  private async initializeStream(): Promise<PanesStreamInfo> {
    const state = this.stateManager.getState();

    return {
      clients: new Set(),
      lastState: {
        panes: [...state.panes],
        projectName: state.projectName,
        sessionName: state.sessionName,
        settings: { ...state.settings }
      },
      isActive: false
    };
  }

  /**
   * Send initial state to a new client
   */
  private async sendInitialState(
    stream: PanesStreamInfo,
    client: StreamClient
  ): Promise<void> {
    const initMessage = {
      type: 'init',
      data: {
        panes: stream.lastState.panes.map(formatPaneResponse),
        projectName: stream.lastState.projectName,
        sessionName: stream.lastState.sessionName,
        settings: stream.lastState.settings,
        timestamp: Date.now()
      }
    };

    try {
      // Send as delimited message using TYPE:JSON\n protocol (same as TerminalStreamer)
      client.push(formatMessage(initMessage));

      // CRITICAL: Send multiple messages immediately to establish flow
      // Cloudflare needs to see substantial data flowing to not buffer
      // Send 5 heartbeats immediately to reach buffer threshold
      for (let i = 0; i < 5; i++) {
        const immediateHeartbeat = formatMessage({
          type: 'heartbeat',
          timestamp: Date.now()
        });
        client.push(immediateHeartbeat);
      }
    } catch (error) {
      // Client disconnected during init
    }
  }

  /**
   * Activate streaming (start monitoring state changes and sending heartbeats)
   */
  private async activateStream(stream: PanesStreamInfo): Promise<void> {
    if (stream.isActive) return;

    try {
      // Subscribe to state changes
      stream.stateSubscription = this.stateManager.subscribe((state) => {
        if (this.isShuttingDown) return;

        // Update last state
        stream.lastState = {
          panes: [...state.panes],
          projectName: state.projectName,
          sessionName: state.sessionName,
          settings: { ...state.settings }
        };

        // Send update to all clients
        this.sendUpdate(stream);
      });

      // Send full refresh every 2 seconds (same as terminal streaming)
      // This matches TerminalStreamer's refresh interval and ensures continuous data flow
      stream.heartbeatInterval = setInterval(() => {
        // Send full state refresh (not just heartbeat) to match terminal behavior
        this.sendUpdate(stream);
      }, 2000);

      stream.isActive = true;
    } catch (error) {
      // Stream activation failed silently
    }
  }

  /**
   * Deactivate streaming
   */
  private deactivateStream(stream: PanesStreamInfo): void {
    // Stop heartbeat
    if (stream.heartbeatInterval) {
      clearInterval(stream.heartbeatInterval);
      stream.heartbeatInterval = undefined;
    }

    // Unsubscribe from state changes
    if (stream.stateSubscription) {
      stream.stateSubscription();
      stream.stateSubscription = undefined;
    }

    stream.isActive = false;
  }

  /**
   * Send update to all clients
   */
  private sendUpdate(stream: PanesStreamInfo): void {
    const updateMessage = {
      type: 'update',
      data: {
        panes: stream.lastState.panes.map(formatPaneResponse),
        projectName: stream.lastState.projectName,
        sessionName: stream.lastState.sessionName,
        settings: stream.lastState.settings,
        timestamp: Date.now()
      }
    };

    // Send to all connected clients
    stream.clients.forEach(client => {
      try {
        // Send as delimited message using TYPE:JSON\n protocol
        client.push(formatMessage(updateMessage));
      } catch (error) {
        // Client disconnected, remove from list
        stream.clients.delete(client);
      }
    });
  }

  /**
   * Send heartbeat to all clients
   */
  private sendHeartbeat(stream: PanesStreamInfo): void {
    const heartbeatMessage = {
      type: 'heartbeat',
      timestamp: Date.now()
    };

    // Send to all connected clients
    stream.clients.forEach(client => {
      try {
        // Send as delimited message using TYPE:JSON\n protocol
        client.push(formatMessage(heartbeatMessage));
      } catch (error) {
        // Client disconnected, remove from list
        stream.clients.delete(client);
      }
    });
  }

  /**
   * Get statistics about active streams
   */
  getStats(): {
    isActive: boolean;
    totalClients: number;
  } {
    return {
      isActive: this.stream?.isActive || false,
      totalClients: this.stream?.clients.size || 0
    };
  }

  /**
   * Shutdown all streams
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.stream) {
      this.deactivateStream(this.stream);
      this.stream = null;
    }

    this.removeAllListeners();
  }
}

// Export singleton instance
let instance: PanesStreamer | null = null;

export function getPanesStreamer(): PanesStreamer {
  if (!instance) {
    instance = new PanesStreamer();
  }
  return instance;
}

export function resetPanesStreamer(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
