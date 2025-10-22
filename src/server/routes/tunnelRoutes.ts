import { eventHandler } from 'h3';

export function createTunnelRoutes(server?: any) {
  return [
    // POST /api/tunnel - Create tunnel for remote access
    {
      path: '/api/tunnel',
      handler: eventHandler(async (event) => {
        if (event.node.req.method === 'POST') {
          if (!server) {
            event.node.res.statusCode = 500;
            return { error: 'Server instance not available' };
          }

          try {
            const url = await server.startTunnel();
            return { url };
          } catch (error: any) {
            event.node.res.statusCode = 500;
            return { error: error.message || 'Failed to create tunnel' };
          }
        }

        event.node.res.statusCode = 405;
        return { error: 'Method not allowed' };
      })
    }
  ];
}
