import { startTunnel } from 'untun';

export class TunnelService {
  private tunnel: any = null;
  private tunnelUrl: string | null = null;

  async start(port: number): Promise<string> {
    try {
      console.error('[TunnelService] Starting tunnel for port', port);

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

      console.error('[TunnelService] Tunnel created, getting URL...');

      // Get URL with timeout
      const urlPromise = this.tunnel.getURL();
      const urlTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Getting tunnel URL timed out after 10 seconds')), 10000);
      });

      this.tunnelUrl = await Promise.race([urlPromise, urlTimeoutPromise]);

      if (!this.tunnelUrl) {
        throw new Error('Tunnel URL is null');
      }

      console.error('[TunnelService] Tunnel URL:', this.tunnelUrl);
      return this.tunnelUrl;
    } catch (error: any) {
      console.error('[TunnelService] Failed to start tunnel:', error.message);
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
