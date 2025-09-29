/**
 * Terminal streaming protocol message definitions
 * Used for communication between server and client over HTTP streams
 */

/**
 * Initial message sent when a client connects
 * Contains full terminal state and dimensions
 */
export interface InitMessage {
  type: 'init';
  width: number;
  height: number;
  content: string; // Full terminal content with ANSI codes
  cursorRow?: number; // Cursor row position (0-based)
  cursorCol?: number; // Cursor column position (0-based)
  timestamp: number;
}

/**
 * Incremental update message
 * Contains only the changes since last update
 */
export interface PatchMessage {
  type: 'patch';
  changes: Array<{
    row: number;      // 0-based row index
    col: number;      // 0-based column index
    text: string;     // New text to insert
    length?: number;  // Number of chars to replace (default: text.length)
  }>;
  timestamp: number;
}

/**
 * Terminal resize message
 * Sent when terminal dimensions change
 */
export interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
  content: string; // Full terminal content after resize
  timestamp: number;
}

/**
 * Heartbeat message to keep connection alive
 */
export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
}

/**
 * Error message for stream errors
 */
export interface ErrorMessage {
  type: 'error';
  error: string;
  recoverable: boolean;
  timestamp: number;
}

/**
 * Union type for all stream messages
 */
export type StreamMessage =
  | InitMessage
  | PatchMessage
  | ResizeMessage
  | HeartbeatMessage
  | ErrorMessage;

/**
 * Parse a delimited stream message
 * Format: "TYPE:JSON\n"
 */
export function parseStreamMessage(line: string): StreamMessage | null {
  try {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return null;

    const type = line.substring(0, colonIndex);
    const json = line.substring(colonIndex + 1).trim();

    if (!json) return null;

    const message = JSON.parse(json);

    // Validate message type
    if (!['INIT', 'PATCH', 'RESIZE', 'HEARTBEAT', 'ERROR'].includes(type)) {
      return null;
    }

    return message as StreamMessage;
  } catch {
    return null;
  }
}

/**
 * Format a message for streaming
 * Returns "TYPE:JSON\n" format
 */
export function formatStreamMessage(message: StreamMessage): string {
  const type = message.type.toUpperCase();
  return `${type}:${JSON.stringify(message)}\n`;
}