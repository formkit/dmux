import { EventEmitter } from 'events';
import { execSync, spawn, ChildProcess } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';
import type { InitMessage, PatchMessage, ResizeMessage } from '../shared/StreamProtocol.js';
import { formatStreamMessage } from '../shared/StreamProtocol.js';

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
  refreshInterval?: NodeJS.Timeout;
  isActive: boolean;
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

    return {
      paneId,
      tmuxPaneId,
      pipePath,
      clients: new Set(),
      width: dimensions.width,
      height: dimensions.height,
      lastContent: content,
      isActive: false
    };
  }

  /**
   * Send initial state to a new client
   */
  private async sendInitialState(
    stream: StreamInfo,
    client: StreamClient
  ): Promise<void> {
    // Get cursor position from tmux
    const cursorPos = this.getCursorPosition(stream.tmuxPaneId);

    // Send raw content with ANSI codes - frontend will parse
    const initMessage: InitMessage = {
      type: 'init',
      width: stream.width,
      height: stream.height,
      content: stream.lastContent,
      cursorRow: cursorPos.row,
      cursorCol: cursorPos.col,
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
   * Get cursor position from tmux
   */
  private getCursorPosition(tmuxPaneId: string): { row: number; col: number } {
    try {
      const output = execSync(
        `tmux display-message -p -t ${tmuxPaneId} -F "#{cursor_y},#{cursor_x}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      const [row, col] = output.split(',').map(Number);
      return { row: row || 0, col: col || 0 };
    } catch (error) {
      return { row: 0, col: 0 };
    }
  }

  /**
   * Activate streaming for a pane (start piping and monitoring)
   */
  private async activateStream(stream: StreamInfo): Promise<void> {
    if (stream.isActive) return;

    try {
      // Stop any existing pipe-pane first
      try {
        execSync(`tmux pipe-pane -t ${stream.tmuxPaneId}`, { stdio: 'pipe' });
      } catch {
        // No existing pipe, which is fine
      }

      // Create empty pipe file (using touch to avoid any output)
      execSync(`> ${stream.pipePath}`, { stdio: 'pipe' });

      // Start tmux pipe-pane
      const pipeCmd = `tmux pipe-pane -t ${stream.tmuxPaneId} -o 'cat >> ${stream.pipePath}'`;
      execSync(pipeCmd, { stdio: 'pipe' });

      // Small delay to ensure pipe-pane is ready
      await new Promise(resolve => setTimeout(resolve, 50));

      // Start tailing the pipe file
      stream.tailProcess = spawn('tail', ['-f', stream.pipePath]);

      // Buffer for accumulating output
      let outputBuffer = '';
      let bufferTimeout: NodeJS.Timeout | null = null;

      // String decoder to handle multi-byte UTF-8 sequences across chunks
      const decoder = new StringDecoder('utf8');

      /**
       * Check if string ends with incomplete ANSI escape sequence
       * Returns the index where the incomplete sequence starts, or -1 if complete
       */
      const findIncompleteEscape = (str: string): number => {
        // Check last few characters for start of escape sequences
        for (let i = Math.max(0, str.length - 10); i < str.length; i++) {
          if (str.charCodeAt(i) === 27) { // ESC
            const remaining = str.substring(i);
            // ESC without following character
            if (remaining.length === 1) return i;

            // ESC[ (CSI) without terminator
            if (remaining[1] === '[') {
              let hasTerminator = false;
              let j = 2;
              for (; j < remaining.length; j++) {
                const c = remaining.charCodeAt(j);
                // Valid CSI parameter/intermediate bytes: 0-9, ;, space through /
                if ((c >= 48 && c <= 57) || c === 59 || (c >= 32 && c <= 47)) {
                  continue; // Valid parameter character, keep looking
                }
                // Final byte (terminator): @ through ~
                if (c >= 64 && c <= 126) {
                  hasTerminator = true;
                  break;
                }
                // Invalid character, sequence is broken - don't buffer it
                break;
              }
              if (!hasTerminator && j === remaining.length) {
                // Reached end without finding terminator, and all chars were valid
                return i;
              }
            }

            // ESC] (OSC) without terminator (BEL or ESC\)
            if (remaining[1] === ']') {
              let hasTerminator = false;
              for (let j = 2; j < remaining.length; j++) {
                if (remaining.charCodeAt(j) === 7) { // BEL
                  hasTerminator = true;
                  break;
                }
                if (remaining.charCodeAt(j) === 27 && remaining[j + 1] === '\\') { // ESC\
                  hasTerminator = true;
                  break;
                }
              }
              if (!hasTerminator) return i;
            }
          }
        }
        return -1;
      };

      // Handle tail output
      stream.tailProcess.stdout?.on('data', (data: Buffer) => {
        if (this.isShuttingDown) return;

        // Use StringDecoder to properly handle multi-byte UTF-8 sequences
        const chunk = decoder.write(data);
        outputBuffer += chunk;

        // Clear existing timeout
        if (bufferTimeout) {
          clearTimeout(bufferTimeout);
        }

        // Buffer for 16ms (60fps)
        bufferTimeout = setTimeout(() => {
          if (outputBuffer) {
            // Check for incomplete escape sequences
            const incompleteIndex = findIncompleteEscape(outputBuffer);

            if (incompleteIndex >= 0) {
              // Send complete portion, keep incomplete sequence in buffer
              const completeOutput = outputBuffer.substring(0, incompleteIndex);
              outputBuffer = outputBuffer.substring(incompleteIndex);

              if (completeOutput) {
                this.processAndSendUpdates(stream, completeOutput);
              }
            } else {
              // Everything is complete, send it all
              this.processAndSendUpdates(stream, outputBuffer);
              outputBuffer = '';
            }
          }
        }, 16);
      });

      // Handle tail process end - flush any remaining bytes
      stream.tailProcess.stdout?.on('end', () => {
        const remaining = decoder.end();
        if (remaining) {
          outputBuffer += remaining;
          if (outputBuffer) {
            this.processAndSendUpdates(stream, outputBuffer);
            outputBuffer = '';
          }
        }
      });

      // Handle tail process errors
      stream.tailProcess.on('error', (error) => {
        // Silently handle tail errors - they're usually benign
      });

      // Start resize monitoring
      stream.resizeCheckInterval = setInterval(() => {
        this.checkForResize(stream);
      }, 500);

      // DISABLED: Periodic refresh can interfere with streaming cursor positioning
      // TODO: Consider re-enabling with better synchronization or only when idle
      /*
      stream.refreshInterval = setInterval(() => {
        const content = this.capturePaneContent(stream.tmuxPaneId);

        // Skip refresh if content is empty (pane might be closed or capture failed)
        if (!content || content.trim().length === 0) {
          return;
        }

        const cursorPos = this.getCursorPosition(stream.tmuxPaneId);

        // Send full refresh as INIT message to reset buffer
        const refreshMessage: InitMessage = {
          type: 'init',
          width: stream.width,
          height: stream.height,
          content: content,
          cursorRow: cursorPos.row,
          cursorCol: cursorPos.col,
          timestamp: Date.now()
        };

        stream.clients.forEach(client => {
          try {
            client.push(formatStreamMessage(refreshMessage));
          } catch (error) {
            stream.clients.delete(client);
          }
        });

        stream.lastContent = content;
      }, 10000); // Full refresh every 10 seconds
      */

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

    // Stop refresh interval
    if (stream.refreshInterval) {
      clearInterval(stream.refreshInterval);
      stream.refreshInterval = undefined;
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
    // Get current cursor position for accurate rendering
    const cursorPos = this.getCursorPosition(stream.tmuxPaneId);

    // DEBUG: Log patch details
    const first100 = output.substring(0, 100).replace(/\x1b/g, '\\x1b').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    const last100 = output.substring(Math.max(0, output.length - 100)).replace(/\x1b/g, '\\x1b').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    console.error(`[PATCH OUT] pane=${stream.paneId} cursor=(${cursorPos.row},${cursorPos.col}) len=${output.length}`);
    console.error(`[PATCH OUT] first100: ${first100}`);
    console.error(`[PATCH OUT] last100: ${last100}`);

    // Send raw output with ANSI codes - frontend will parse
    // Keep \r\n sequences - frontend handles them properly
    const patchMessage: PatchMessage = {
      type: 'patch',
      changes: [{
        row: 0,
        col: 0,
        text: output
      }],
      cursorRow: cursorPos.row,
      cursorCol: cursorPos.col,
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

    // Keep raw content for new clients
    stream.lastContent += output;
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

      // Capture new full state
      const content = this.capturePaneContent(stream.tmuxPaneId);
      stream.lastContent = content;

      // Send resize message with raw content - frontend will parse
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
   * Only captures the visible area (no scrollback) so cursor position matches
   */
  private capturePaneContent(tmuxPaneId: string): string {
    try {
      // -p: print to stdout
      // -e: include escape sequences
      // -J: join wrapped lines
      return execSync(
        `tmux capture-pane -epJ -t ${tmuxPaneId}`,
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