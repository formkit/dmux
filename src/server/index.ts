import { createServer } from 'http';
import { createApp, toNodeListener } from 'h3';
import { StateManager } from '../shared/StateManager.js';
import { findAvailablePort } from '../utils/port.js';
import { setupRoutes } from './routes.js';
import { tunnelService } from '../services/TunnelService.js';

export class DmuxServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number = 0;
  private stateManager: StateManager;
  private isShuttingDown = false;
  private app: ReturnType<typeof createApp>;
  private tunnelUrl: string | null = null;

  constructor() {
    this.stateManager = StateManager.getInstance();
    this.app = createApp();
  }

  async start(): Promise<{ port: number; url: string; tunnelUrl?: string }> {
    try {
      // Find an available port
      this.port = await findAvailablePort([42000, 42001, 42002, 42003, 42004]);

      // Setup routes
      setupRoutes(this.app);

      // Create HTTP server with h3 app
      this.server = createServer(toNodeListener(this.app));

      return new Promise(async (resolve, reject) => {
        if (!this.server) {
          reject(new Error('Server not initialized'));
          return;
        }

        this.server.on('error', (err) => {
          console.error('Server error:', err);
          reject(err);
        });

        this.server.listen(this.port, '127.0.0.1', async () => {
          const serverUrl = `http://127.0.0.1:${this.port}`;

          // Start tunnel
          try {
            this.tunnelUrl = await tunnelService.start(this.port);
            this.stateManager.updateServerInfo(this.port, this.tunnelUrl);
            resolve({ port: this.port, url: serverUrl, tunnelUrl: this.tunnelUrl });
          } catch (tunnelErr) {
            console.error('Failed to start tunnel:', tunnelErr);
            this.stateManager.updateServerInfo(this.port, serverUrl);
            resolve({ port: this.port, url: serverUrl });
          }
        });
      });
    } catch (err) {
      console.error('Failed to start h3 server:', err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown || !this.server) {
      return;
    }

    this.isShuttingDown = true;

    // Stop tunnel first
    await tunnelService.stop();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.port = 0;
          this.tunnelUrl = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  getUrl(): string {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }

  isRunning(): boolean {
    return !!this.server && this.port > 0;
  }
}