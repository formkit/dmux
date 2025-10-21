import { eventHandler, setHeader } from 'h3';
import { getEmbeddedAsset } from '../embedded-assets.js';

function serveEmbeddedAsset(filename: string): string {
  const asset = getEmbeddedAsset(filename);
  if (!asset) {
    throw new Error(`Embedded asset not found: ${filename}`);
  }
  return asset.content;
}

export function createHealthRoutes() {
  return [
    // GET /api/health - Health check
    {
      path: '/api/health',
      handler: eventHandler(async () => {
        return { status: 'ok', timestamp: Date.now() };
      })
    },

    // Static files - Dashboard HTML
    // IMPORTANT: This must be last to avoid catching API routes
    {
      path: '/',
      handler: eventHandler(async (event) => {
        const path = event.node.req.url || '/';

        // Skip API routes - let them 404 naturally
        if (path.startsWith('/api/')) {
          event.node.res.statusCode = 404;
          return { error: 'API endpoint not found' };
        }

        if (path === '/' || path === '/index.html') {
          setHeader(event, 'Content-Type', 'text/html');
          return serveEmbeddedAsset('dashboard.html');
        }

        // Terminal viewer page
        if (path.startsWith('/panes/')) {
          setHeader(event, 'Content-Type', 'text/html');
          return serveEmbeddedAsset('terminal.html');
        }

        // Serve any CSS file from root of dist/
        if (path.endsWith('.css')) {
          const filename = path.substring(1); // Remove leading /
          const asset = getEmbeddedAsset(filename);
          if (asset) {
            setHeader(event, 'Content-Type', 'text/css');
            return asset.content;
          }
        }

        // Serve any JS file from root of dist/ (not in subdirectories)
        if (path.endsWith('.js') && path.lastIndexOf('/') === 0) {
          const filename = path.substring(1); // Remove leading /
          const asset = getEmbeddedAsset(filename);
          if (asset) {
            setHeader(event, 'Content-Type', 'application/javascript');
            return asset.content;
          }
        }

        // Serve chunk files
        if (path.startsWith('/chunks/')) {
          setHeader(event, 'Content-Type', 'application/javascript');
          const filename = path.substring(1); // Remove leading /
          return serveEmbeddedAsset(filename);
        }

        // 404 for unknown routes
        event.node.res.statusCode = 404;
        return 'Not Found';
      })
    }
  ];
}
