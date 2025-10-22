import { eventHandler, setHeader, type App } from 'h3';
import { createPanesRoutes } from './panesRoutes.js';
import { createStreamRoutes } from './streamRoutes.js';
import { createKeysRoutes } from './keysRoutes.js';
import { createActionsRoutes } from './actionsRoutes.js';
import { createSettingsRoutes } from './settingsRoutes.js';
import { createTunnelRoutes } from './tunnelRoutes.js';
import { createHealthRoutes } from './healthRoutes.js';

/**
 * Sets up all application routes
 * @param app - The h3 app instance
 * @param server - Optional server instance for tunnel functionality
 */
export function setupRoutes(app: App, server?: any) {
  // CORS middleware for all routes
  app.use('/', eventHandler(async (event) => {
    // Get the origin from the request
    const origin = event.node.req.headers.origin;

    // Allow any origin (including tunnel URLs) for SSE and API requests
    if (origin) {
      setHeader(event, 'Access-Control-Allow-Origin', origin);
      setHeader(event, 'Access-Control-Allow-Credentials', 'true');
    } else {
      setHeader(event, 'Access-Control-Allow-Origin', '*');
    }

    setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
    setHeader(event, 'Access-Control-Max-Age', 86400); // 24 hours

    if (event.node.req.method === 'OPTIONS') {
      event.node.res.statusCode = 204;
      return '';
    }
  }));

  // Mount settings routes (includes session, hooks, logs)
  const settingsRoutes = createSettingsRoutes();
  settingsRoutes.forEach(route => {
    app.use(route.path, route.handler);
  });

  // Mount tunnel routes
  const tunnelRoutes = createTunnelRoutes(server);
  tunnelRoutes.forEach(route => {
    app.use(route.path, route.handler);
  });

  // Mount actions routes (uses createRouter internally)
  const actionsRouter = createActionsRoutes();
  app.use(actionsRouter);

  // Mount panes routes (uses createRouter internally)
  const panesRouter = createPanesRoutes();
  app.use(panesRouter);

  // Mount stream routes
  const streamRoutes = createStreamRoutes();
  streamRoutes.forEach(route => {
    app.use(route.path, route.handler);
  });

  // Mount keys routes
  const keysRoutes = createKeysRoutes();
  keysRoutes.forEach(route => {
    app.use(route.path, route.handler);
  });

  // Mount health routes (includes static file serving - MUST BE LAST)
  const healthRoutes = createHealthRoutes();
  healthRoutes.forEach(route => {
    app.use(route.path, route.handler);
  });
}
