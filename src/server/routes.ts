import {
  eventHandler,
  getRouterParams,
  readBody,
  setHeader,
  send,
  createEventStream,
  type App
} from 'h3';
import { StateManager } from '../shared/StateManager.js';
import type { DmuxPane } from '../types.js';
import { getDashboardHtml, getDashboardCss, getDashboardJs } from './static.js';
import { getTerminalStreamer } from '../services/TerminalStreamer.js';

const stateManager = StateManager.getInstance();

export function setupRoutes(app: App) {
  // CORS middleware for all routes
  app.use('/', eventHandler(async (event) => {
    setHeader(event, 'Access-Control-Allow-Origin', '*');
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type');

    if (event.node.req.method === 'OPTIONS') {
      event.node.res.statusCode = 204;
      return '';
    }
  }));

  // GET /api/health - Health check
  app.use('/api/health', eventHandler(async () => {
    return { status: 'ok', timestamp: Date.now() };
  }));

  // GET /api/session - Get session info
  app.use('/api/session', eventHandler(async () => {
    const state = stateManager.getState();
    return {
      projectName: state.projectName,
      sessionName: state.sessionName,
      projectRoot: state.projectRoot,
      serverUrl: state.serverUrl,
      settings: state.settings,
      paneCount: state.panes.length,
      timestamp: Date.now()
    };
  }));

  // GET /api/panes - List all panes
  app.use('/api/panes', eventHandler(async (event) => {
    if (event.node.req.method !== 'GET') return;

    const state = stateManager.getState();
    return {
      panes: state.panes.map(formatPaneResponse),
      projectName: state.projectName,
      sessionName: state.sessionName,
      timestamp: Date.now()
    };
  }));

  // GET /api/panes/:id - Get specific pane
  app.use('/api/panes/:id', eventHandler(async (event) => {
    if (event.node.req.method !== 'GET') return;

    const params = getRouterParams(event);
    const paneId = params?.id;

    if (!paneId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing pane ID' };
    }

    const pane = stateManager.getPaneById(decodeURIComponent(paneId));

    if (!pane) {
      event.node.res.statusCode = 404;
      return { error: 'Pane not found' };
    }

    return formatPaneResponse(pane);
  }));

  // POST /api/panes/:id/actions - Execute action on pane
  app.use('/api/panes/:id/actions', eventHandler(async (event) => {
    if (event.node.req.method !== 'POST') return;

    const params = getRouterParams(event);
    const paneId = params?.id;

    if (!paneId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing pane ID' };
    }

    const pane = stateManager.getPaneById(decodeURIComponent(paneId));

    if (!pane) {
      event.node.res.statusCode = 404;
      return { error: 'Pane not found' };
    }

    try {
      const action = await readBody(event);

      // For now, just acknowledge the action
      // Future: Implement actual pane actions (sendKeys, resize, etc.)
      return {
        status: 'acknowledged',
        paneId,
        action,
        message: 'Action endpoints will be implemented in future versions'
      };
    } catch (err) {
      event.node.res.statusCode = 400;
      return { error: 'Invalid request body' };
    }
  }));

  // GET /api/stream/:paneId - Stream terminal output
  app.use('/api/stream/:paneId', eventHandler(async (event) => {
    const { paneId } = getRouterParams(event);

    if (!paneId) {
      event.node.res.statusCode = 400;
      return { error: 'Pane ID required' };
    }

    // Find the pane
    const panes = stateManager.getPanes();
    const pane = panes.find((p: DmuxPane) => p.id === paneId);

    if (!pane || !pane.paneId) {
      event.node.res.statusCode = 404;
      return { error: 'Pane not found' };
    }

    // Create SSE stream
    const eventStream = createEventStream(event);
    const streamer = getTerminalStreamer();

    // Start streaming
    await streamer.startStream(pane.id, pane.paneId, eventStream);

    // Handle client disconnect
    event.node.req.on('close', () => {
      streamer.stopStream(pane.id, eventStream);
      eventStream.close();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        eventStream.push(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup heartbeat on disconnect
    event.node.req.on('close', () => {
      clearInterval(heartbeat);
    });

    // Keep connection open
    await eventStream.send();
  }));

  // GET /api/stream-stats - Get streaming statistics
  app.use('/api/stream-stats', eventHandler(async () => {
    const streamer = getTerminalStreamer();
    return streamer.getStats();
  }));

  // Static files - Dashboard HTML
  app.use('/', eventHandler(async (event) => {
    const path = event.node.req.url || '/';

    if (path === '/' || path === '/index.html') {
      setHeader(event, 'Content-Type', 'text/html');
      return getDashboardHtml();
    }

    if (path === '/styles.css') {
      setHeader(event, 'Content-Type', 'text/css');
      return getDashboardCss();
    }

    if (path === '/dashboard.js') {
      setHeader(event, 'Content-Type', 'application/javascript');
      return getDashboardJs();
    }

    // 404 for unknown routes
    event.node.res.statusCode = 404;
    return 'Not Found';
  }));
}

function formatPaneResponse(pane: DmuxPane) {
  return {
    id: pane.id,
    slug: pane.slug,
    prompt: pane.prompt,
    paneId: pane.paneId,
    worktreePath: pane.worktreePath,
    agent: pane.agent || 'unknown',
    agentStatus: pane.agentStatus || 'idle',
    testStatus: pane.testStatus,
    testWindowId: pane.testWindowId,
    devStatus: pane.devStatus,
    devUrl: pane.devUrl,
    devWindowId: pane.devWindowId,
    lastAgentCheck: pane.lastAgentCheck
  };
}