import {
  eventHandler,
  getRouterParams,
  getRouterParam,
  readBody,
  setHeader,
  send,
  createEventStream,
  createRouter,
  type App
} from 'h3';
import { StateManager } from '../shared/StateManager.js';
import type { DmuxPane } from '../types.js';
import { getDashboardHtml, getDashboardCss, getDashboardJs, getTerminalViewerHtml, getTerminalJs } from './static.js';
import { getTerminalStreamer } from '../services/TerminalStreamer.js';
import { formatStreamMessage, type HeartbeatMessage } from '../shared/StreamProtocol.js';

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

  // GET /api/panes/:id/snapshot - Get current pane snapshot
  app.use('/api/panes/:id/snapshot', eventHandler(async (event) => {
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

    // Capture current pane state from tmux
    const { execSync } = await import('child_process');

    try {
      // Get dimensions
      const dimensionsOutput = execSync(
        `tmux display-message -p -t ${pane.paneId} -F "#{pane_width},#{pane_height}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      const [width, height] = dimensionsOutput.split(',').map(Number);

      // Get content
      const content = execSync(
        `tmux capture-pane -epJ -t ${pane.paneId}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      // Get cursor position
      const cursorOutput = execSync(
        `tmux display-message -p -t ${pane.paneId} -F "#{cursor_y},#{cursor_x}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      const [cursorRow, cursorCol] = cursorOutput.split(',').map(Number);

      return {
        width: width || 80,
        height: height || 24,
        content,
        cursorRow: cursorRow || 0,
        cursorCol: cursorCol || 0
      };
    } catch (error) {
      event.node.res.statusCode = 500;
      return { error: 'Failed to capture pane state' };
    }
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
  // MUST be before the catch-all route
  app.use('/api/stream', eventHandler(async (event) => {
    const url = event.node.req.url || '';
    // When using app.use('/api/stream'), the URL is already stripped
    // So we just need to remove the leading slash
    const paneId = url.startsWith('/') ? url.substring(1) : url;

    if (!paneId || paneId.includes('/')) {
      event.node.res.statusCode = 404;
      return { error: 'Invalid pane ID' };
    }

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

    // Create a readable stream
    const { Readable } = await import('stream');
    const stream = new Readable({
      read() {} // No-op, we'll push data as it arrives
    });

    const streamer = getTerminalStreamer();

    // Start streaming - pass the stream object
    await streamer.startStream(pane.id, pane.paneId, stream);

    // Handle client disconnect
    event.node.req.on('close', () => {
      streamer.stopStream(pane.id, stream);
      stream.destroy();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        const heartbeatMessage: HeartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now()
        };
        stream.push(formatStreamMessage(heartbeatMessage));
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup heartbeat on disconnect
    event.node.req.on('close', () => {
      clearInterval(heartbeat);
      stream.destroy();
    });

    // Return the readable stream - h3 will pipe it to the response
    return stream;
  }));

  // GET /api/stream-stats - Get streaming statistics
  app.use('/api/stream-stats', eventHandler(async () => {
    const streamer = getTerminalStreamer();
    return streamer.getStats();
  }));

  // GET /api/test-stream - Simple test stream
  app.use('/api/test-stream', eventHandler(async (event) => {
    const { Readable } = await import('stream');
    const stream = new Readable({
      read() {}
    });

    // Send some test data
    stream.push('TEST:First message\n');
    setTimeout(() => stream.push('TEST:Second message\n'), 100);
    setTimeout(() => stream.push('TEST:Third message\n'), 200);
    setTimeout(() => stream.push(null), 300); // End stream

    return stream;
  }));

  // Static files - Dashboard HTML
  // IMPORTANT: This must be last to avoid catching API routes
  app.use('/', eventHandler(async (event) => {
    const path = event.node.req.url || '/';

    // Skip API routes - let them 404 naturally
    if (path.startsWith('/api/')) {
      event.node.res.statusCode = 404;
      return { error: 'API endpoint not found' };
    }

    if (path === '/' || path === '/index.html') {
      setHeader(event, 'Content-Type', 'text/html');
      return getDashboardHtml();
    }

    // Terminal viewer page
    if (path.startsWith('/panes/')) {
      setHeader(event, 'Content-Type', 'text/html');
      return getTerminalViewerHtml();
    }

    if (path === '/styles.css') {
      setHeader(event, 'Content-Type', 'text/css');
      return getDashboardCss();
    }

    if (path === '/dashboard.js') {
      setHeader(event, 'Content-Type', 'application/javascript');
      return getDashboardJs();
    }

    if (path === '/terminal.js') {
      setHeader(event, 'Content-Type', 'application/javascript');
      return getTerminalJs();
    }

    if (path === '/vue.esm-browser.js') {
      setHeader(event, 'Content-Type', 'application/javascript');
      const fs = await import('fs');
      const vuePath = new URL('../../node_modules/vue/dist/vue.esm-browser.js', import.meta.url);
      return fs.readFileSync(vuePath, 'utf-8');
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