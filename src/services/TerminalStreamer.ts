import { EventEmitter } from 'events';
import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { Readable } from 'stream';
import type { InitMessage, PatchMessage, ResizeMessage } from '../shared/StreamProtocol.js';
import { formatStreamMessage } from '../shared/StreamProtocol.js';
import { TerminalDiffer } from './TerminalDiffer.js';

// Stream interface - now using Node.js Readable stream
type StreamClient = Readable;

interface StreamInfo {
  paneId: string;
  tmuxPaneId: string;
  pipePath: string;
  tailProcess?: ChildProcess;
  clients: Set<StreamClient>;
  width: number;
  height: number;
  lastContent: string;
  resizeCheckInterval?: NodeJS.Timeout;
  isActive: boolean;
  differ?: TerminalDiffer;
}

interface PaneDimensions {
  width: number;
  height: number;
}

/**
 * Manages real-time streaming of tmux panes to browser clients
 * Uses Server-Sent Events for efficient one-way data flow
 */
export class TerminalStreamer extends EventEmitter {
  private streams = new Map<string, StreamInfo>();
  private isShuttingDown = false;

  /**
   * Start streaming a pane to a client
   */
  async startStream(
    paneId: string,
    tmuxPaneId: string,
    client: StreamClient
  ): Promise<void> {
    if (this.isShuttingDown) return;


    // Get or create stream info for this pane
    let stream = this.streams.get(paneId);

    if (!stream) {
      stream = await this.initializeStream(paneId, tmuxPaneId);
      this.streams.set(paneId, stream);
    }

    // Add client to stream
    stream.clients.add(client);

    // Send initial state to new client
    await this.sendInitialState(stream, client);

    // If first client, start the streaming
    if (stream.clients.size === 1 && !stream.isActive) {
      await this.activateStream(stream);
    }
  }

  /**
   * Stop streaming to a specific client
   */
  stopStream(paneId: string, client: StreamClient): void {
    const stream = this.streams.get(paneId);
    if (!stream) return;

    // Remove client
    stream.clients.delete(client);

    // If no more clients, deactivate stream
    if (stream.clients.size === 0) {
      this.deactivateStream(stream);
      this.streams.delete(paneId);
    }
  }

  /**
   * Initialize stream info for a pane
   */
  private async initializeStream(
    paneId: string,
    tmuxPaneId: string
  ): Promise<StreamInfo> {
    // Get pane dimensions
    const dimensions = this.getPaneDimensions(tmuxPaneId);

    // Capture current state
    const content = this.capturePaneContent(tmuxPaneId);

    // Create pipe path
    const pipePath = `/tmp/dmux-pipe-${paneId}-${Date.now()}`;

    // Create differ for this stream
    const differ = new TerminalDiffer(dimensions.width, dimensions.height);
    // Initialize differ with current content
    differ.applyAndDiff(content);

    return {
      paneId,
      tmuxPaneId,
      pipePath,
      clients: new Set(),
      width: dimensions.width,
      height: dimensions.height,
      lastContent: content,
      isActive: false,
      differ
    };
  }

  /**
   * Send initial state to a new client
   */
  private async sendInitialState(
    stream: StreamInfo,
    client: StreamClient
  ): Promise<void> {
    const initMessage: InitMessage = {
      type: 'init',
      width: stream.width,
      height: stream.height,
      content: stream.lastContent,
      timestamp: Date.now()
    };

    try {
      // Send as delimited message using protocol formatter
      client.push(formatStreamMessage(initMessage));
    } catch (error) {
      // Client disconnected during init
    }
  }

  /**
   * Activate streaming for a pane (start piping and monitoring)
   */
  private async activateStream(stream: StreamInfo): Promise<void> {
    if (stream.isActive) return;

    try {
      // Create pipe file first
      execSync(`touch ${stream.pipePath}`, { stdio: 'pipe' });

      // Start tmux pipe-pane
      const pipeCmd = `tmux pipe-pane -t ${stream.tmuxPaneId} -o 'cat >> ${stream.pipePath}'`;
      execSync(pipeCmd, { stdio: 'pipe' });

      // Start tailing the pipe file
      stream.tailProcess = spawn('tail', ['-f', stream.pipePath]);

      // Buffer for accumulating output
      let outputBuffer = '';
      let bufferTimeout: NodeJS.Timeout | null = null;

      // Handle tail output
      stream.tailProcess.stdout?.on('data', (data: Buffer) => {
        if (this.isShuttingDown) return;

        const chunk = data.toString();
        outputBuffer += chunk;

        // Clear existing timeout
        if (bufferTimeout) {
          clearTimeout(bufferTimeout);
        }

        // Buffer for 16ms (60fps)
        bufferTimeout = setTimeout(() => {
          if (outputBuffer) {
            this.processAndSendUpdates(stream, outputBuffer);
            outputBuffer = '';
          }
        }, 16);
      });

      // Handle tail process errors
      stream.tailProcess.on('error', (error) => {
        // Silently handle tail errors - they're usually benign
      });

      // Start resize monitoring
      stream.resizeCheckInterval = setInterval(() => {
        this.checkForResize(stream);
      }, 500);

      stream.isActive = true;
    } catch (error) {
      // Stream activation failed silently
    }
  }

  /**
   * Deactivate streaming for a pane
   */
  private deactivateStream(stream: StreamInfo): void {
    // Stop resize monitoring
    if (stream.resizeCheckInterval) {
      clearInterval(stream.resizeCheckInterval);
      stream.resizeCheckInterval = undefined;
    }

    // Stop tail process
    if (stream.tailProcess) {
      stream.tailProcess.kill();
      stream.tailProcess = undefined;
    }

    // Stop tmux pipe
    try {
      execSync(`tmux pipe-pane -t ${stream.tmuxPaneId}`, { stdio: 'pipe' });
    } catch (error) {
      // Ignore pipe-pane stop errors
    }

    // Clean up pipe file
    if (existsSync(stream.pipePath)) {
      try {
        unlinkSync(stream.pipePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    stream.isActive = false;
  }

  /**
   * Process output and send updates to clients
   */
  private processAndSendUpdates(stream: StreamInfo, output: string): void {
    if (!stream.differ) {
      // Fallback if differ not initialized
      return;
    }

    // Generate patches using the differ
    const changes = stream.differ.applyAndDiff(output);

    // Only send if there are actual changes
    if (changes.length > 0) {
      const patchMessage: PatchMessage = {
        type: 'patch',
        changes,
        timestamp: Date.now()
      };

      // Send to all connected clients
      stream.clients.forEach(client => {
        try {
          // Send as delimited message using protocol formatter
          client.push(formatStreamMessage(patchMessage));
        } catch (error) {
          // Client disconnected, remove from list
          stream.clients.delete(client);
        }
      });
    }

    // Update last content with full state from differ
    stream.lastContent = stream.differ.getFullState();
  }

  /**
   * Check if pane has been resized
   */
  private checkForResize(stream: StreamInfo): void {
    const dimensions = this.getPaneDimensions(stream.tmuxPaneId);

    if (dimensions.width !== stream.width || dimensions.height !== stream.height) {
      // Pane was resized
      stream.width = dimensions.width;
      stream.height = dimensions.height;

      // Update differ dimensions
      if (stream.differ) {
        stream.differ.resize(dimensions.width, dimensions.height);
      }

      // Capture new full state
      const content = this.capturePaneContent(stream.tmuxPaneId);
      stream.lastContent = content;

      // Re-initialize differ with new content after resize
      if (stream.differ) {
        stream.differ.reset();
        stream.differ.applyAndDiff(content);
      }

      // Send resize message to all clients
      const resizeMessage: ResizeMessage = {
        type: 'resize',
        width: dimensions.width,
        height: dimensions.height,
        content: content,
        timestamp: Date.now()
      };

      stream.clients.forEach(client => {
        try {
          // Send as delimited message using protocol formatter
          client.push(formatStreamMessage(resizeMessage));
        } catch (error) {
          // Client disconnected, remove from list
          stream.clients.delete(client);
        }
      });

      // Restart piping after resize
      this.restartPiping(stream);
    }
  }

  /**
   * Restart piping after a resize
   */
  private restartPiping(stream: StreamInfo): void {
    // Stop current pipe
    try {
      execSync(`tmux pipe-pane -t ${stream.tmuxPaneId}`, { stdio: 'pipe' });
    } catch {}

    // Kill tail process
    if (stream.tailProcess) {
      stream.tailProcess.kill();
    }

    // Clean up old pipe file
    if (existsSync(stream.pipePath)) {
      try {
        unlinkSync(stream.pipePath);
      } catch {}
    }

    // Create new pipe path
    stream.pipePath = `/tmp/dmux-pipe-${stream.paneId}-${Date.now()}`;

    // Recreate differ with new dimensions if it exists
    if (stream.differ) {
      const content = this.capturePaneContent(stream.tmuxPaneId);
      stream.differ = new TerminalDiffer(stream.width, stream.height);
      stream.differ.applyAndDiff(content);
    }

    // Restart piping
    setTimeout(() => {
      if (stream.isActive && !this.isShuttingDown) {
        this.activateStream(stream);
      }
    }, 100);
  }

  /**
   * Get pane dimensions from tmux
   */
  private getPaneDimensions(tmuxPaneId: string): PaneDimensions {
    try {
      const output = execSync(
        `tmux display-message -p -t ${tmuxPaneId} -F "#{pane_width}x#{pane_height}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      const [width, height] = output.split('x').map(Number);

      return { width: width || 80, height: height || 24 };
    } catch (error) {
      // Return defaults on error
      return { width: 80, height: 24 }; // Default dimensions
    }
  }

  /**
   * Capture current pane content with ANSI codes
   */
  private capturePaneContent(tmuxPaneId: string): string {
    try {
      return execSync(
        `tmux capture-pane -ep -t ${tmuxPaneId}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
    } catch (error) {
      // Return empty on error
      return '';
    }
  }

  /**
   * Get statistics about active streams
   */
  getStats(): {
    activeStreams: number;
    totalClients: number;
    streams: Array<{
      paneId: string;
      clients: number;
      dimensions: string;
    }>;
  } {
    const streams = Array.from(this.streams.entries()).map(([paneId, stream]) => ({
      paneId,
      clients: stream.clients.size,
      dimensions: `${stream.width}x${stream.height}`
    }));

    const totalClients = streams.reduce((sum, s) => sum + s.clients, 0);

    return {
      activeStreams: this.streams.size,
      totalClients,
      streams
    };
  }

  /**
   * Shutdown all streams
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Deactivate all streams
    for (const stream of this.streams.values()) {
      this.deactivateStream(stream);
    }

    this.streams.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
let instance: TerminalStreamer | null = null;

export function getTerminalStreamer(): TerminalStreamer {
  if (!instance) {
    instance = new TerminalStreamer();
  }
  return instance;
}

export function resetTerminalStreamer(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}