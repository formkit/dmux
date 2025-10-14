/**
 * Centralized Logging Service for dmux
 *
 * Replaces scattered console.log/error calls with a unified logging system
 * that can be viewed in a dedicated UI without messing up pane formatting.
 */

import { EventEmitter } from 'events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;  // e.g., 'git', 'tmux', 'paneActions', 'api'
  paneId?: string;  // Associate log with a specific pane
  read: boolean;
  stack?: string;   // Stack trace for errors
}

/**
 * LogService singleton - central logging hub for dmux
 */
export class LogService extends EventEmitter {
  private static instance: LogService;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000; // Circular buffer size
  private logCounter: number = 0;

  private constructor() {
    super();
  }

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * Add a log entry
   */
  private addLog(level: LogLevel, message: string, source?: string, paneId?: string, stack?: string): void {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${this.logCounter++}`,
      timestamp: Date.now(),
      level,
      message,
      source,
      paneId,
      read: false,
      stack,
    };

    this.logs.push(entry);

    // Maintain circular buffer - remove oldest logs when limit exceeded
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Emit event for listeners (StateManager will pick this up)
    this.emit('log-added', entry);

    // Also log to console for development (can be disabled in production)
    if (process.env.NODE_ENV !== 'production' || level === 'error') {
      const prefix = `[${source || 'dmux'}]`;
      switch (level) {
        case 'error':
          console.error(prefix, message, stack || '');
          break;
        case 'warn':
          console.warn(prefix, message);
          break;
        case 'info':
          console.log(prefix, message);
          break;
        case 'debug':
          // Only show debug in development
          if (process.env.DEBUG_DMUX) {
            console.log(prefix, message);
          }
          break;
      }
    }
  }

  /**
   * Log an error
   */
  error(message: string, source?: string, paneId?: string, error?: Error): void {
    const stack = error?.stack;
    this.addLog('error', message, source, paneId, stack);
  }

  /**
   * Log a warning
   */
  warn(message: string, source?: string, paneId?: string): void {
    this.addLog('warn', message, source, paneId);
  }

  /**
   * Log an info message
   */
  info(message: string, source?: string, paneId?: string): void {
    this.addLog('info', message, source, paneId);
  }

  /**
   * Log a debug message
   */
  debug(message: string, source?: string, paneId?: string): void {
    this.addLog('debug', message, source, paneId);
  }

  /**
   * Get all logs with optional filtering
   */
  getLogs(filter?: {
    level?: LogLevel | LogLevel[];
    source?: string;
    paneId?: string;
    unreadOnly?: boolean;
  }): LogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.level) {
        const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
        filtered = filtered.filter(log => levels.includes(log.level));
      }

      if (filter.source) {
        filtered = filtered.filter(log => log.source === filter.source);
      }

      if (filter.paneId) {
        filtered = filtered.filter(log => log.paneId === filter.paneId);
      }

      if (filter.unreadOnly) {
        filtered = filtered.filter(log => !log.read);
      }
    }

    // Return newest first
    return filtered.reverse();
  }

  /**
   * Get count of unread errors
   */
  getUnreadErrorCount(): number {
    return this.logs.filter(log => log.level === 'error' && !log.read).length;
  }

  /**
   * Get count of unread warnings
   */
  getUnreadWarningCount(): number {
    return this.logs.filter(log => log.level === 'warn' && !log.read).length;
  }

  /**
   * Mark specific logs as read
   */
  markAsRead(logIds: string[]): void {
    const idsSet = new Set(logIds);
    this.logs.forEach(log => {
      if (idsSet.has(log.id)) {
        log.read = true;
      }
    });
    this.emit('logs-marked-read', logIds);
  }

  /**
   * Mark all logs as read
   */
  markAllAsRead(): void {
    this.logs.forEach(log => {
      log.read = true;
    });
    this.emit('all-logs-marked-read');
  }

  /**
   * Mark all logs for a specific level as read
   */
  markLevelAsRead(level: LogLevel): void {
    const markedIds: string[] = [];
    this.logs.forEach(log => {
      if (log.level === level && !log.read) {
        log.read = true;
        markedIds.push(log.id);
      }
    });
    if (markedIds.length > 0) {
      this.emit('logs-marked-read', markedIds);
    }
  }

  /**
   * Clear all logs
   */
  clearAll(): void {
    this.logs = [];
    this.emit('logs-cleared');
  }

  /**
   * Clear logs for a specific pane
   */
  clearForPane(paneId: string): void {
    const before = this.logs.length;
    this.logs = this.logs.filter(log => log.paneId !== paneId);
    const after = this.logs.length;
    if (before !== after) {
      this.emit('logs-cleared', { paneId, count: before - after });
    }
  }

  /**
   * Get summary stats
   */
  getStats(): {
    total: number;
    errors: number;
    warnings: number;
    unreadErrors: number;
    unreadWarnings: number;
  } {
    return {
      total: this.logs.length,
      errors: this.logs.filter(l => l.level === 'error').length,
      warnings: this.logs.filter(l => l.level === 'warn').length,
      unreadErrors: this.getUnreadErrorCount(),
      unreadWarnings: this.getUnreadWarningCount(),
    };
  }

  /**
   * Reset the service (for testing)
   */
  reset(): void {
    this.logs = [];
    this.logCounter = 0;
    this.removeAllListeners();
  }
}

// Export singleton instance
export default LogService.getInstance();
