/**
 * PaneLifecycleManager - Manages pane lifecycle with proper locking to prevent race conditions
 *
 * Replaces the timeout-based `intentionallyClosedPanes` Set with a proper event-driven
 * locking mechanism. Prevents race conditions between user actions and worker thread
 * pane detection.
 */

import { EventEmitter } from 'events';
import { LogService } from './LogService.js';

interface PaneCloseInfo {
  reason: string;
  timestamp: number;
}

export class PaneLifecycleManager extends EventEmitter {
  private static instance: PaneLifecycleManager;
  private closingPanes = new Map<string, PaneCloseInfo>();
  private locks = new Map<string, Promise<void>>();
  private logger = LogService.getInstance();

  private constructor() {
    super();
  }

  static getInstance(): PaneLifecycleManager {
    if (!PaneLifecycleManager.instance) {
      PaneLifecycleManager.instance = new PaneLifecycleManager();
    }
    return PaneLifecycleManager.instance;
  }

  /**
   * Execute operation with exclusive lock on pane
   * Prevents concurrent operations on same pane
   */
  async withLock<T>(paneId: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing lock to release
    while (this.locks.has(paneId)) {
      await this.locks.get(paneId);
    }

    // Create new lock
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(paneId, lockPromise);

    try {
      return await operation();
    } finally {
      this.locks.delete(paneId);
      resolveLock!();
    }
  }

  /**
   * Begin pane close operation (sets lock)
   * Call this BEFORE closing the pane to prevent race conditions
   */
  async beginClose(paneId: string, reason: string): Promise<void> {
    await this.withLock(paneId, async () => {
      this.closingPanes.set(paneId, { reason, timestamp: Date.now() });
      this.logger.debug(`Pane ${paneId} close initiated: ${reason}`, 'PaneLifecycle');
      this.emit('pane-closing', { paneId, reason });
    });
  }

  /**
   * Complete pane close operation (releases lock)
   * Call this AFTER the pane has been closed
   */
  async completeClose(paneId: string): Promise<void> {
    await this.withLock(paneId, async () => {
      this.closingPanes.delete(paneId);
      this.logger.debug(`Pane ${paneId} close completed`, 'PaneLifecycle');
      this.emit('pane-closed', { paneId });
    });
  }

  /**
   * Check if pane is currently being closed
   * Worker threads should call this before reporting missing panes
   */
  isClosing(paneId: string): boolean {
    return this.closingPanes.has(paneId);
  }

  /**
   * Check if pane has active lock (any operation in progress)
   */
  isLocked(paneId: string): boolean {
    return this.locks.has(paneId);
  }

  /**
   * Get info about a pane being closed
   */
  getCloseInfo(paneId: string): PaneCloseInfo | undefined {
    return this.closingPanes.get(paneId);
  }

  /**
   * Cancel a close operation (if it hasn't completed yet)
   * Returns true if cancelled, false if already completed
   */
  async cancelClose(paneId: string): Promise<boolean> {
    if (!this.closingPanes.has(paneId)) {
      return false;
    }

    await this.withLock(paneId, async () => {
      this.closingPanes.delete(paneId);
      this.logger.debug(`Pane ${paneId} close cancelled`, 'PaneLifecycle');
      this.emit('pane-close-cancelled', { paneId });
    });

    return true;
  }

  /**
   * Clean up stale close operations (older than 30 seconds)
   * This is a safety mechanism in case completeClose() is never called
   */
  cleanupStaleOperations(): void {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [paneId, info] of this.closingPanes.entries()) {
      if (now - info.timestamp > staleThreshold) {
        this.logger.warn(
          `Cleaning up stale close operation for pane ${paneId} (age: ${(now - info.timestamp) / 1000}s)`,
          'PaneLifecycle'
        );
        this.closingPanes.delete(paneId);
        this.emit('pane-close-stale', { paneId, info });
      }
    }
  }
}
