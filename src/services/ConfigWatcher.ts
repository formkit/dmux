import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';
import type { DmuxPane } from '../types.js';

export interface ConfigData {
  panes: DmuxPane[];
}

/**
 * Watches the dmux.config.json file for changes and emits events
 * when the file is modified. Only emits when actual changes occur.
 */
export class ConfigWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private configPath: string;
  private lastContent: string = '';
  private paused: boolean = false;

  constructor(configPath: string) {
    super();
    this.configPath = configPath;
  }

  /**
   * Temporarily pause emitting change events (for atomic operations)
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume emitting change events
   */
  resume(): void {
    this.paused = false;
  }

  async start(): Promise<void> {
    // Read initial content
    try {
      this.lastContent = await readFile(this.configPath, 'utf-8');
    } catch (err) {
      // File might not exist yet
      this.lastContent = '';
    }

    // Watch for changes
    this.watcher = watch(this.configPath, {
      persistent: true,
      ignoreInitial: true, // Don't emit on initial add
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms after last write
        pollInterval: 50
      }
    });

    this.watcher.on('change', async (path) => {
      await this.handleFileChange(path);
    });

    this.watcher.on('add', async (path) => {
      // File was created
      await this.handleFileChange(path);
    });

    this.watcher.on('error', (error) => {
      console.error('Config watcher error:', error);
    });
  }

  private async handleFileChange(path: string): Promise<void> {
    // Skip if paused (during atomic operations)
    if (this.paused) {
      return;
    }

    try {
      const newContent = await readFile(path, 'utf-8');

      // Only emit if content actually changed
      if (newContent !== this.lastContent) {
        this.lastContent = newContent;

        try {
          const config: ConfigData = JSON.parse(newContent);
          this.emit('change', config);
        } catch (parseErr) {
          console.error('Failed to parse config file:', parseErr);
        }
      }
    } catch (err) {
      console.error('Failed to read config file:', err);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.removeAllListeners();
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
