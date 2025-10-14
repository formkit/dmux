import { startTunnel } from 'untun';
import { LogService } from './LogService.js';

export class TunnelService {
  private tunnel: any = null;
  private tunnelUrl: string | null = null;
  private isCreating: boolean = false;

  async start(port: number): Promise<string> {
    // If we already have a URL, return it
    if (this.tunnelUrl) {
      LogService.getInstance().info('Returning existing tunnel URL', 'TunnelService');
      return this.tunnelUrl;
    }

    // If tunnel is being created, wait a bit and check again
    if (this.isCreating) {
      LogService.getInstance().info('Tunnel creation already in progress, waiting...', 'TunnelService');
      // Wait up to 45 seconds for existing creation to finish
      for (let i = 0; i < 45; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.tunnelUrl) {
          return this.tunnelUrl;
        }
      }
      throw new Error('Tunnel creation timed out while waiting for existing process');
    }

    // If we have a tunnel but no URL yet, try to get the URL
    if (this.tunnel && !this.tunnelUrl) {
      try {
        LogService.getInstance().info('Found existing tunnel, attempting to get URL...', 'TunnelService');
        const urlPromise = this.tunnel.getURL();
        const urlTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Getting tunnel URL timed out after 30 seconds')), 30000);
        });
        this.tunnelUrl = await Promise.race([urlPromise, urlTimeoutPromise]);
        if (this.tunnelUrl) {
          LogService.getInstance().info(`Tunnel URL: ${this.tunnelUrl}`, 'TunnelService');
          return this.tunnelUrl;
        }
      } catch (error: any) {
        LogService.getInstance().error('Failed to get URL from existing tunnel', 'TunnelService', undefined, error);
        // Continue to create new tunnel
      }
    }

    this.isCreating = true;

    try {
      const msg = `Starting tunnel for port ${port}`;
      LogService.getInstance().info(msg, 'TunnelService');

      // Start tunnel with timeout and better error handling
      const tunnelPromise = startTunnel({
        port,
        acceptCloudflareNotice: true
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tunnel creation timed out after 45 seconds')), 45000);
      });

      this.tunnel = await Promise.race([tunnelPromise, timeoutPromise]);

      const msg1 = 'Tunnel created, getting URL...';
      LogService.getInstance().info(msg1, 'TunnelService');

      // Get URL with longer timeout (cloudflare can be slow)
      const urlPromise = this.tunnel.getURL();
      const urlTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Getting tunnel URL timed out after 30 seconds')), 30000);
      });

      this.tunnelUrl = await Promise.race([urlPromise, urlTimeoutPromise]);

      if (!this.tunnelUrl) {
        throw new Error('Tunnel URL is null');
      }

      const msg2 = `Tunnel URL: ${this.tunnelUrl}`;
      LogService.getInstance().info(msg2, 'TunnelService');
      return this.tunnelUrl;
    } catch (error: any) {
      const msg = 'Failed to start tunnel';
      LogService.getInstance().error(msg, 'TunnelService', undefined, error instanceof Error ? error : undefined);
      // Don't clean up the tunnel on failure - it might be in progress
      // Just clean up the URL
      this.tunnelUrl = null;
      throw error;
    } finally {
      this.isCreating = false;
    }
  }

  async stop(): Promise<void> {
    if (this.tunnel) {
      await this.tunnel.close();
      this.tunnel = null;
      this.tunnelUrl = null;
    }
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }
}

export const tunnelService = new TunnelService();
