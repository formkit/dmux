import { startTunnel } from 'untun';

export class TunnelService {
  private tunnel: any = null;
  private tunnelUrl: string | null = null;

  async start(port: number): Promise<string> {
    try {
      this.tunnel = await startTunnel({
        port,
        acceptCloudflareNotice: true
      });
      this.tunnelUrl = await this.tunnel.getURL();
      if (!this.tunnelUrl) {
        throw new Error('Tunnel URL is null');
      }
      return this.tunnelUrl;
    } catch (error) {
      console.error('Failed to start tunnel:', error);
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
