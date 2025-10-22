import { EventEmitter } from 'events';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  severity: ToastSeverity;
  timestamp: number;
}

const SINGLE_TOAST_DURATION = 10000; // 10 seconds
const QUEUED_TOAST_DURATION = 5000;  // 5 seconds

/**
 * ToastService - Manages toast notifications with queue
 *
 * Features:
 * - One toast visible at a time
 * - Queue additional toasts
 * - Auto-dismiss after timeout
 * - Show queue position (1/3, 2/3, etc.)
 */
export class ToastService extends EventEmitter {
  private static instance: ToastService;
  private currentToast: Toast | null = null;
  private queue: Toast[] = [];
  private dismissTimer: NodeJS.Timeout | null = null;
  private toastStartTime: number = 0;

  private constructor() {
    super();
  }

  static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }

  /**
   * Show a toast notification
   * If a toast is already showing, queue it and adjust current timeout
   */
  showToast(message: string, severity: ToastSeverity = 'info'): void {
    const toast: Toast = {
      id: `toast-${Date.now()}-${Math.random()}`,
      message,
      severity,
      timestamp: Date.now(),
    };

    // If no current toast, show immediately
    if (!this.currentToast) {
      this.displayToast(toast);
    } else {
      // Queue it
      const wasEmpty = this.queue.length === 0;
      this.queue.push(toast);
      this.emit('queue-updated');

      // If this is the first item in queue, adjust current toast timeout
      if (wasEmpty) {
        this.adjustCurrentToastTimeout();
      }
    }
  }

  /**
   * Adjust current toast timeout when queue goes from empty to having items
   * Ensures current toast only shows for QUEUED_TOAST_DURATION total
   */
  private adjustCurrentToastTimeout(): void {
    if (!this.currentToast || !this.dismissTimer) return;

    // Calculate elapsed time
    const elapsed = Date.now() - this.toastStartTime;
    const remaining = Math.max(0, QUEUED_TOAST_DURATION - elapsed);

    // Clear existing timer and set new one
    clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      this.dismissCurrent();
    }, remaining);
  }

  /**
   * Display a toast and set auto-dismiss timer
   */
  private displayToast(toast: Toast): void {
    // Clear any existing timer
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }

    this.currentToast = toast;
    this.toastStartTime = Date.now();
    this.emit('toast-shown', toast);

    // Determine timeout based on queue
    const timeout = this.queue.length > 0
      ? QUEUED_TOAST_DURATION
      : SINGLE_TOAST_DURATION;

    // Set auto-dismiss timer
    this.dismissTimer = setTimeout(() => {
      this.dismissCurrent();
    }, timeout);
  }

  /**
   * Dismiss the current toast and show next in queue
   */
  private dismissCurrent(): void {
    this.currentToast = null;
    this.dismissTimer = null;
    this.emit('toast-dismissed');

    // Show next toast in queue if any
    if (this.queue.length > 0) {
      const nextToast = this.queue.shift()!;
      this.displayToast(nextToast);
    }
  }

  /**
   * Manually dismiss the current toast
   */
  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
    this.dismissCurrent();
  }

  /**
   * Clear all toasts (current + queue)
   */
  clearAll(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
    this.currentToast = null;
    this.queue = [];
    this.dismissTimer = null;
    this.emit('all-cleared');
  }

  /**
   * Get current toast and queue info
   */
  getState(): {
    currentToast: Toast | null;
    queueLength: number;
    queuePosition: number | null; // 1-based position (1/3, 2/3, etc.)
  } {
    return {
      currentToast: this.currentToast,
      queueLength: this.queue.length,
      queuePosition: this.currentToast && this.queue.length > 0
        ? 1 // Current is position 1
        : null,
    };
  }

  /**
   * Get total count (current + queue)
   */
  getTotalCount(): number {
    return (this.currentToast ? 1 : 0) + this.queue.length;
  }

  /**
   * Reset service (for testing)
   */
  reset(): void {
    this.clearAll();
    this.removeAllListeners();
  }
}

export default ToastService.getInstance();
