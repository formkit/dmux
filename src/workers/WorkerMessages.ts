// Message protocol for worker communication

export interface WorkerMessage {
  id: string;          // Unique message ID for request/response pairing
  type: string;        // Message type
  timestamp: number;
  payload?: any;
}

// Messages sent from main thread to worker
export interface InboundMessage extends WorkerMessage {
  type: 'init' | 'capture' | 'send-keys' | 'analyze-complete' | 'shutdown' | 'resize' | 'get-status';
}

// Messages sent from worker to main thread
export interface OutboundMessage extends WorkerMessage {
  type: 'ready' | 'status-change' | 'capture-result' | 'analysis-needed' | 'error' | 'shutdown-complete' | 'pane-removed';
  paneId: string;
}

// Worker configuration passed on initialization
export interface WorkerConfig {
  paneId: string;
  tmuxPaneId: string;
  agent?: 'claude' | 'opencode';
  pollInterval?: number; // Default 1000ms
}

// Status change payload
export interface StatusChangePayload {
  status: 'idle' | 'analyzing' | 'waiting' | 'working';
  previousStatus?: string;
  captureSnapshot?: string; // Last 30 lines for debugging
}

// Analysis request payload
export interface AnalysisNeededPayload {
  captureSnapshot: string;
  reason: 'new-static-content' | 'revalidation';
}

// Error payload
export interface ErrorPayload {
  error: string;
  code?: string;
  recoverable: boolean;
}

// Type guards
export function isInboundMessage(msg: any): msg is InboundMessage {
  return msg && typeof msg.type === 'string' && typeof msg.id === 'string';
}

export function isOutboundMessage(msg: any): msg is OutboundMessage {
  return msg && typeof msg.type === 'string' && typeof msg.paneId === 'string';
}