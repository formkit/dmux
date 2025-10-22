import { EventEmitter } from 'events';
import type { DmuxPane, ProjectSettings, LogEntry } from '../types.js';
import { ConfigWatcher } from '../services/ConfigWatcher.js';
import { LogService } from '../services/LogService.js';
import { ToastService, type Toast } from '../services/ToastService.js';

export interface DmuxState {
  panes: DmuxPane[];
  projectName: string;
  sessionName: string;
  projectRoot: string;
  settings: ProjectSettings;
  serverPort?: number;
  serverUrl?: string;
  panesFile?: string;
  logs: LogEntry[];
  unreadErrorCount: number;
  unreadWarningCount: number;
  currentToast: Toast | null;
  toastQueueLength: number;
  toastQueuePosition: number | null;
}

export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private state: DmuxState;
  private updateCallbacks: Set<(state: DmuxState) => void> = new Set();
  private configWatcher: ConfigWatcher | null = null;
  private debugMessageCallback: ((message: string) => void) | undefined;
  private logService: LogService;
  private toastService: ToastService;

  private constructor() {
    super();
    this.logService = LogService.getInstance();
    this.toastService = ToastService.getInstance();
    this.state = {
      panes: [],
      projectName: '',
      sessionName: '',
      projectRoot: '',
      settings: {},
      logs: [],
      unreadErrorCount: 0,
      unreadWarningCount: 0,
      currentToast: null,
      toastQueueLength: 0,
      toastQueuePosition: null,
    };

    // Listen to log events and sync state
    this.logService.on('log-added', () => {
      this.syncLogsFromService();
    });

    this.logService.on('logs-marked-read', () => {
      this.syncLogsFromService();
    });

    this.logService.on('all-logs-marked-read', () => {
      this.syncLogsFromService();
    });

    this.logService.on('logs-cleared', () => {
      this.syncLogsFromService();
    });

    // Listen to toast events and sync state
    this.toastService.on('toast-shown', () => {
      this.syncToastsFromService();
    });

    this.toastService.on('toast-dismissed', () => {
      this.syncToastsFromService();
    });

    this.toastService.on('queue-updated', () => {
      this.syncToastsFromService();
    });

    this.toastService.on('all-cleared', () => {
      this.syncToastsFromService();
    });
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  getState(): DmuxState {
    return { ...this.state };
  }

  updatePanes(panes: DmuxPane[]): void {
    this.state.panes = [...panes];
    this.notifyListeners();
  }

  updateProjectInfo(projectName: string, sessionName: string, projectRoot: string, panesFile?: string): void {
    this.state.projectName = projectName;
    this.state.sessionName = sessionName;
    this.state.projectRoot = projectRoot;
    if (panesFile) {
      this.state.panesFile = panesFile;
      this.startWatchingConfig(panesFile);
    }
    this.notifyListeners();
  }

  private startWatchingConfig(panesFile: string): void {
    // Stop existing watcher if any
    if (this.configWatcher) {
      this.configWatcher.stop();
    }

    // Start new watcher
    this.configWatcher = new ConfigWatcher(panesFile);
    this.configWatcher.on('change', (config) => {
      // Update state with new panes from file
      this.state.panes = [...config.panes];
      this.notifyListeners();
    });

    this.configWatcher.start().catch(err => {
      console.error('Failed to start config watcher:', err);
    });
  }

  updateSettings(settings: ProjectSettings): void {
    this.state.settings = { ...settings };
    this.notifyListeners();
  }

  updateServerInfo(port: number, url: string): void {
    this.state.serverPort = port;
    this.state.serverUrl = url;
    this.notifyListeners();
  }

  getPaneById(id: string): DmuxPane | undefined {
    return this.state.panes.find(pane => pane.id === id);
  }

  getPanes(): DmuxPane[] {
    return [...this.state.panes];
  }

  subscribe(callback: (state: DmuxState) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.updateCallbacks.forEach(callback => {
      try {
        callback(stateCopy);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    });
    this.emit('stateChange', stateCopy);
  }

  setDebugMessageCallback(callback: ((message: string) => void) | undefined): void {
    this.debugMessageCallback = callback;
  }

  setDebugMessage(message: string): void {
    if (this.debugMessageCallback) {
      this.debugMessageCallback(message);
    }
  }

  /**
   * Pause config watcher during atomic operations to prevent race conditions
   */
  pauseConfigWatcher(): void {
    if (this.configWatcher) {
      this.configWatcher.pause();
    }
  }

  /**
   * Resume config watcher after atomic operations
   */
  resumeConfigWatcher(): void {
    if (this.configWatcher) {
      this.configWatcher.resume();
    }
  }

  /**
   * Sync logs from LogService to state
   */
  private syncLogsFromService(): void {
    const logs = this.logService.getLogs();
    const stats = this.logService.getStats();

    this.state.logs = logs;
    this.state.unreadErrorCount = stats.unreadErrors;
    this.state.unreadWarningCount = stats.unreadWarnings;

    this.notifyListeners();
  }

  /**
   * Get logs from service with optional filtering
   */
  getLogs(filter?: Parameters<typeof this.logService.getLogs>[0]): LogEntry[] {
    return this.logService.getLogs(filter);
  }

  /**
   * Get unread error count
   */
  getUnreadErrorCount(): number {
    return this.logService.getUnreadErrorCount();
  }

  /**
   * Get unread warning count
   */
  getUnreadWarningCount(): number {
    return this.logService.getUnreadWarningCount();
  }

  /**
   * Mark specific logs as read
   */
  markLogsAsRead(logIds: string[]): void {
    this.logService.markAsRead(logIds);
  }

  /**
   * Mark all logs as read
   */
  markAllLogsAsRead(): void {
    this.logService.markAllAsRead();
  }

  /**
   * Mark all logs of a specific level as read
   */
  markLogLevelAsRead(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logService.markLevelAsRead(level);
  }

  /**
   * Clear all logs
   */
  clearAllLogs(): void {
    this.logService.clearAll();
  }

  /**
   * Clear logs for a specific pane
   */
  clearLogsForPane(paneId: string): void {
    this.logService.clearForPane(paneId);
  }

  /**
   * Generate test logs for development
   */
  generateTestLogs(count: number = 100): void {
    this.logService.generateTestLogs(count);
  }

  /**
   * Get log statistics
   */
  getLogStats(): ReturnType<typeof this.logService.getStats> {
    return this.logService.getStats();
  }

  /**
   * Sync toasts from ToastService to state
   */
  private syncToastsFromService(): void {
    const toastState = this.toastService.getState();

    this.state.currentToast = toastState.currentToast;
    this.state.toastQueueLength = toastState.queueLength;
    this.state.toastQueuePosition = toastState.queuePosition;

    this.notifyListeners();
  }

  /**
   * Show a toast notification
   * Also logs the message to the log panel
   */
  showToast(message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    // Show the toast
    this.toastService.showToast(message, severity);

    // Also log it to the log panel
    const logLevel = severity === 'success' ? 'info' : severity === 'warning' ? 'warn' : severity;
    switch (logLevel) {
      case 'error':
        this.logService.error(message, 'toast');
        break;
      case 'warn':
        this.logService.warn(message, 'toast');
        break;
      case 'info':
      default:
        this.logService.info(message, 'toast');
        break;
    }
  }

  /**
   * Dismiss current toast
   */
  dismissToast(): void {
    this.toastService.dismiss();
  }

  /**
   * Clear all toasts
   */
  clearAllToasts(): void {
    this.toastService.clearAll();
  }

  reset(): void {
    // Stop file watcher
    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = null;
    }

    this.state = {
      panes: [],
      projectName: '',
      sessionName: '',
      projectRoot: '',
      settings: {},
      logs: [],
      unreadErrorCount: 0,
      unreadWarningCount: 0,
      currentToast: null,
      toastQueueLength: 0,
      toastQueuePosition: null,
    };
    this.updateCallbacks.clear();
    this.removeAllListeners();
    this.debugMessageCallback = undefined;

    // Also reset services
    this.logService.reset();
    this.toastService.reset();
  }
}

export default StateManager.getInstance();