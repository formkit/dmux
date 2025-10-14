import { startTunnel } from 'untun';
import { LogService } from './LogService.js';

export class TunnelService {
  private tunnel: any = null;
  private tunnelUrl: string | null = null;

  async start(port: number): Promise<string> {
    try {
      const msg = `Starting tunnel for port ${port}`;
      console.error('[TunnelService]', msg);
      LogService.getInstance().info(msg, 'TunnelService');

      // Start tunnel with timeout and better error handling
      const tunnelPromise = startTunnel({
        port,
        acceptCloudflareNotice: true
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tunnel creation timed out after 30 seconds')), 30000);
      });

      this.tunnel = await Promise.race([tunnelPromise, timeoutPromise]);

      const msg1 = 'Tunnel created, getting URL...';
      console.error('[TunnelService]', msg1);
      LogService.getInstance().info(msg1, 'TunnelService');

      // Get URL with timeout
      const urlPromise = this.tunnel.getURL();
      const urlTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Getting tunnel URL timed out after 10 seconds')), 10000);
      });

      this.tunnelUrl = await Promise.race([urlPromise, urlTimeoutPromise]);

      if (!this.tunnelUrl) {
        throw new Error('Tunnel URL is null');
      }

      const msg2 = `Tunnel URL: ${this.tunnelUrl}`;
      console.error('[TunnelService]', msg2);
      LogService.getInstance().info(msg2, 'TunnelService');
      return this.tunnelUrl;
    } catch (error: any) {
      const msg = 'Failed to start tunnel';
      console.error('[TunnelService]', msg, error.message);
      LogService.getInstance().error(msg, 'TunnelService', undefined, error instanceof Error ? error : undefined);
      // Clean up on failure
      if (this.tunnel) {
        try {
          await this.tunnel.close();
        } catch {}
        this.tunnel = null;
      }
      throw error;
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
