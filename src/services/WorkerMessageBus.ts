import { EventEmitter } from 'events';
import type { OutboundMessage, InboundMessage } from '../workers/WorkerMessages.js';

export type MessageHandler = (paneId: string, message: OutboundMessage) => void | Promise<void>;

export interface MessageSubscription {
  unsubscribe: () => void;
}

/**
 * Central message router for worker communication
 * Handles message distribution and subscription management
 */
export class WorkerMessageBus extends EventEmitter {
  private subscribers = new Map<string, Set<MessageHandler>>();
  private responseHandlers = new Map<string, (response: OutboundMessage) => void>();
  private requestTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Handle incoming message from a worker
   */
  handleWorkerMessage(paneId: string, message: OutboundMessage): void {
    // Check if this is a response to a request
    if (message.id && this.responseHandlers.has(message.id)) {
      const handler = this.responseHandlers.get(message.id)!;
      const timeout = this.requestTimeouts.get(message.id);

      if (timeout) {
        clearTimeout(timeout);
        this.requestTimeouts.delete(message.id);
      }

      this.responseHandlers.delete(message.id);
      handler(message);
      return;
    }

    // Emit typed events for different message types
    this.emit(`worker:${message.type}`, { ...message, paneId });

    // Notify type-specific subscribers
    const handlers = this.subscribers.get(message.type) || new Set();
    handlers.forEach(handler => {
      try {
        handler(paneId, message);
      } catch (error) {
        console.error(`Error in message handler for ${message.type}:`, error);
      }
    });

    // Emit generic event for logging/debugging
    this.emit('worker:message', { paneId, message });
  }

  /**
   * Subscribe to specific message types
   */
  subscribe(messageType: string, handler: MessageHandler): MessageSubscription {
    if (!this.subscribers.has(messageType)) {
      this.subscribers.set(messageType, new Set());
    }

    this.subscribers.get(messageType)!.add(handler);

    // Return unsubscribe function
    return {
      unsubscribe: () => {
        this.subscribers.get(messageType)?.delete(handler);
      }
    };
  }

  /**
   * Subscribe to multiple message types at once
   */
  subscribeMultiple(
    messageTypes: string[],
    handler: MessageHandler
  ): MessageSubscription {
    const subscriptions = messageTypes.map(type => this.subscribe(type, handler));

    return {
      unsubscribe: () => {
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    };
  }

  /**
   * Wait for a response to a specific request
   */
  waitForResponse(
    requestId: string,
    timeoutMs: number = 5000
  ): Promise<OutboundMessage> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(requestId);
        this.requestTimeouts.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.requestTimeouts.set(requestId, timeout);

      // Set up response handler
      this.responseHandlers.set(requestId, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * Clear all subscriptions for a specific message type
   */
  clearSubscriptions(messageType?: string): void {
    if (messageType) {
      this.subscribers.delete(messageType);
    } else {
      this.subscribers.clear();
    }
  }

  /**
   * Get statistics about message bus activity
   */
  getStats(): {
    subscriptionCount: number;
    pendingResponses: number;
    messageTypes: string[];
  } {
    return {
      subscriptionCount: Array.from(this.subscribers.values()).reduce(
        (sum, set) => sum + set.size,
        0
      ),
      pendingResponses: this.responseHandlers.size,
      messageTypes: Array.from(this.subscribers.keys())
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all timeouts
    this.requestTimeouts.forEach(timeout => clearTimeout(timeout));
    this.requestTimeouts.clear();

    // Clear all handlers
    this.responseHandlers.clear();
    this.subscribers.clear();

    // Remove all event listeners
    this.removeAllListeners();
  }
}