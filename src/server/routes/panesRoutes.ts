import {
  eventHandler,
  getRouterParams,
  readBody,
  createRouter,
} from 'h3';
import { StateManager } from '../../shared/StateManager.js';
import type { DmuxPane } from '../../types.js';
import { LogService } from '../../services/LogService.js';

const stateManager = StateManager.getInstance();

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
    lastAgentCheck: pane.lastAgentCheck,
    optionsQuestion: pane.optionsQuestion,
    options: pane.options,
    potentialHarm: pane.potentialHarm,
    agentSummary: pane.agentSummary
  };
}

export function createPanesRoutes() {
  const router = createRouter();

  // GET /api/panes - List all panes
  router.get('/api/panes', eventHandler(async (event) => {
    const state = stateManager.getState();
    return {
      panes: state.panes.map(formatPaneResponse),
      projectName: state.projectName,
      sessionName: state.sessionName,
      timestamp: Date.now()
    };
  }));

  // GET /api/panes/:id - Get specific pane
  router.get('/api/panes/:id', eventHandler(async (event) => {
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

  // POST /api/panes - Create a new pane
  router.post('/api/panes', eventHandler(async (event) => {
    try {
      const body = await readBody(event);
      let { prompt, agent } = body;

      console.error('[API] POST /api/panes called with:', { prompt, agent, body });

      if (!prompt || typeof prompt !== 'string') {
        event.node.res.statusCode = 400;
        return { error: 'Missing or invalid prompt' };
      }

      // Normalize agent to undefined if not provided or empty
      if (!agent || agent === '') {
        agent = undefined;
      }

      console.error('[API] After normalization, agent =', agent);

      if (agent && agent !== 'claude' && agent !== 'opencode') {
        event.node.res.statusCode = 400;
        return { error: 'Invalid agent. Must be "claude" or "opencode"' };
      }

      // Get available agents using robust detection (same as TUI)
      const { execSync } = await import('child_process');
      const fsPromises = await import('fs/promises');
      const availableAgents: Array<'claude' | 'opencode'> = [];

      // Check for Claude
      const hasClaude = await (async () => {
        try {
          const userShell = process.env.SHELL || '/bin/bash';
          const result = execSync(
            `${userShell} -i -c "command -v claude 2>/dev/null || which claude 2>/dev/null"`,
            { encoding: 'utf-8', stdio: 'pipe' }
          ).trim();
          if (result) return true;
        } catch {}

        const claudePaths = [
          `${process.env.HOME}/.claude/local/claude`,
          `${process.env.HOME}/.local/bin/claude`,
          '/usr/local/bin/claude',
          '/opt/homebrew/bin/claude',
          '/usr/bin/claude',
          `${process.env.HOME}/bin/claude`,
        ];

        for (const p of claudePaths) {
          try {
            await fsPromises.access(p);
            return true;
          } catch {}
        }
        return false;
      })();

      if (hasClaude) availableAgents.push('claude');

      // Check for opencode
      const hasOpencode = await (async () => {
        try {
          const userShell = process.env.SHELL || '/bin/bash';
          const result = execSync(
            `${userShell} -i -c "command -v opencode 2>/dev/null || which opencode 2>/dev/null"`,
            { encoding: 'utf-8', stdio: 'pipe' }
          ).trim();
          if (result) return true;
        } catch {}

        const opencodePaths = [
          '/opt/homebrew/bin/opencode',
          '/usr/local/bin/opencode',
          `${process.env.HOME}/.local/bin/opencode`,
          `${process.env.HOME}/bin/opencode`,
        ];

        for (const p of opencodePaths) {
          try {
            await fsPromises.access(p);
            return true;
          } catch {}
        }
        return false;
      })();

      if (hasOpencode) availableAgents.push('opencode');

      console.error('[API] Available agents:', availableAgents);

      if (availableAgents.length === 0) {
        event.node.res.statusCode = 500;
        return { error: 'No agents available. Install claude or opencode.' };
      }

      // If no agent specified and multiple available, return agent choice needed
      if (!agent && availableAgents.length > 1) {
        console.error('[API] Returning needsAgentChoice');
        return {
          needsAgentChoice: true,
          availableAgents,
          message: 'Please specify an agent (claude or opencode) in the request body',
        };
      }

      console.error('[API] Proceeding to create pane with agent:', agent);

      // Import pane creation utility
      const { createPane } = await import('../../utils/paneCreation.js');
      const state = stateManager.getState();

      // Create the pane
      const result = await createPane(
        {
          prompt,
          agent: agent || (availableAgents.length === 1 ? availableAgents[0] : undefined),
          projectName: state.projectName || 'unknown',
          existingPanes: state.panes,
        },
        availableAgents
      );

      // Check if agent choice is needed
      if (result.needsAgentChoice) {
        return {
          needsAgentChoice: true,
          availableAgents,
          message: 'Please specify an agent (claude or opencode) in the request body',
        };
      }

      // Note: createPane() already saves the pane to config for the first content pane
      // For subsequent panes, we need to check if it's already been saved before adding
      const fs = await import('fs/promises');
      const path = await import('path');

      // Get panes file path from state
      const projectRoot = state.projectRoot || process.cwd();
      const panesFile = path.join(
        projectRoot,
        '.dmux',
        `dmux.config.json`
      );

      // Read existing panes
      let existingPanes: DmuxPane[] = [];
      try {
        const configContent = await fs.readFile(panesFile, 'utf-8');
        const config = JSON.parse(configContent);
        existingPanes = Array.isArray(config) ? config : config.panes || [];
      } catch {
        // File doesn't exist yet, start with empty array
      }

      // Check if the pane was already saved by createPane()
      const paneAlreadyExists = existingPanes.some(p => p.id === result.pane.id);

      if (!paneAlreadyExists) {
        // Add new pane only if it doesn't exist
        const updatedPanes = [...existingPanes, result.pane];

        // Write back to file - ConfigWatcher will update StateManager
        await fs.writeFile(
          panesFile,
          JSON.stringify({ panes: updatedPanes }, null, 2)
        );
      }

      return {
        success: true,
        pane: formatPaneResponse(result.pane),
        message: 'Pane created successfully',
      };
    } catch (err: any) {
      const msg = 'Failed to create pane via API';
      console.error(msg, err);
      LogService.getInstance().error(msg, 'routes', undefined, err instanceof Error ? err : undefined);
      event.node.res.statusCode = 500;
      return { error: 'Failed to create pane', details: err.message };
    }
  }));

  // GET /api/panes/:id/snapshot - Get current pane snapshot
  router.get('/api/panes/:id/snapshot', eventHandler(async (event) => {
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

  // PUT /api/panes/:id/test - Update test status (called by run_test hook)
  router.put('/api/panes/:id/test', eventHandler(async (event) => {
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
      const body = await readBody(event);
      const { status, output } = body;

      if (!status || !['running', 'passed', 'failed'].includes(status)) {
        event.node.res.statusCode = 400;
        return { error: 'Invalid or missing status. Must be: running, passed, or failed' };
      }

      // Update pane with test status
      const updatedPane = {
        ...pane,
        testStatus: status as 'running' | 'passed' | 'failed',
        testOutput: output || pane.testOutput,
      };

      // Update in StateManager
      const state = stateManager.getState();
      const updatedPanes = state.panes.map(p => p.id === pane.id ? updatedPane : p);
      stateManager.updatePanes(updatedPanes);

      // Persist to config file
      const fs = await import('fs/promises');
      const path = await import('path');
      const projectRoot = state.projectRoot || process.cwd();
      const panesFile = path.join(projectRoot, '.dmux', 'dmux.config.json');

      await fs.writeFile(panesFile, JSON.stringify({ panes: updatedPanes }, null, 2));

      return {
        success: true,
        paneId: pane.id,
        testStatus: status,
        message: `Test status updated to ${status}`,
      };
    } catch (err: any) {
      const msg = 'Failed to update test status';
      console.error(msg, err);
      LogService.getInstance().error(msg, 'routes', pane.id, err instanceof Error ? err : undefined);
      event.node.res.statusCode = 500;
      return { error: 'Failed to update test status', details: err.message };
    }
  }));

  // PUT /api/panes/:id/dev - Update dev server status (called by run_dev hook)
  router.put('/api/panes/:id/dev', eventHandler(async (event) => {
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
      const body = await readBody(event);
      const { url, status } = body;

      if (!status || !['running', 'stopped'].includes(status)) {
        event.node.res.statusCode = 400;
        return { error: 'Invalid or missing status. Must be: running or stopped' };
      }

      // Update pane with dev server info
      const updatedPane = {
        ...pane,
        devStatus: status as 'running' | 'stopped',
        devUrl: url || pane.devUrl,
      };

      // Update in StateManager
      const state = stateManager.getState();
      const updatedPanes = state.panes.map(p => p.id === pane.id ? updatedPane : p);
      stateManager.updatePanes(updatedPanes);

      // Persist to config file
      const fs = await import('fs/promises');
      const path = await import('path');
      const projectRoot = state.projectRoot || process.cwd();
      const panesFile = path.join(projectRoot, '.dmux', 'dmux.config.json');

      await fs.writeFile(panesFile, JSON.stringify({ panes: updatedPanes }, null, 2));

      return {
        success: true,
        paneId: pane.id,
        devStatus: status,
        devUrl: url,
        message: `Dev server ${status === 'running' ? 'started' : 'stopped'}${url ? ` at ${url}` : ''}`,
      };
    } catch (err: any) {
      const msg = 'Failed to update dev status';
      console.error(msg, err);
      LogService.getInstance().error(msg, 'routes', pane.id, err instanceof Error ? err : undefined);
      event.node.res.statusCode = 500;
      return { error: 'Failed to update dev status', details: err.message };
    }
  }));

  // POST /api/panes/:id/actions - Execute action on pane (legacy endpoint)
  router.post('/api/panes/:id/actions', eventHandler(async (event) => {
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

  return router;
}
