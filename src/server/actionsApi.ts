/**
 * REST API for Pane Actions
 *
 * Provides HTTP endpoints for executing standardized pane actions.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { executeAction, getAvailableActions, PaneAction, ACTION_REGISTRY } from '../actions/index.js';
import type { ActionContext } from '../actions/types.js';
import { actionResultToAPIResponse, handleConfirmResponse, handleChoiceResponse, handleInputResponse } from '../adapters/apiActionHandler.js';
import { StateManager } from '../shared/StateManager.js';

/**
 * Handle GET /api/actions
 * List all available actions with metadata
 */
export async function handleListActions(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    actions: Object.values(ACTION_REGISTRY),
  }));
}

/**
 * Handle GET /api/panes/:paneId/actions
 * Get available actions for a specific pane
 */
export async function handleGetPaneActions(
  req: IncomingMessage,
  res: ServerResponse,
  paneId: string
): Promise<void> {
  const stateManager = StateManager.getInstance();
  const panes = stateManager.getPanes();
  const settings = stateManager.getState().settings;

  const pane = panes.find(p => p.id === paneId);

  if (!pane) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Pane not found',
    }));
    return;
  }

  const availableActions = getAvailableActions(pane, settings);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    pane: {
      id: pane.id,
      slug: pane.slug,
    },
    actions: availableActions,
  }));
}

/**
 * Handle POST /api/panes/:paneId/actions/:actionId
 * Execute an action on a pane
 */
export async function handleExecuteAction(
  req: IncomingMessage,
  res: ServerResponse,
  paneId: string,
  actionId: string
): Promise<void> {
  const stateManager = StateManager.getInstance();
  const panes = stateManager.getPanes();

  const pane = panes.find(p => p.id === paneId);

  if (!pane) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Pane not found',
    }));
    return;
  }

  // Parse request body for action parameters
  let params: any = {};
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    try {
      params = JSON.parse(body);
    } catch {
      // Ignore parse errors, use empty params
    }
  }

  // Create action context
  const state = stateManager.getState();
  const context: ActionContext = {
    panes,
    currentPaneId: paneId,
    sessionName: state.sessionName || 'dmux',
    projectName: state.projectName || 'project',
    savePanes: async (updatedPanes) => {
      stateManager.updatePanes(updatedPanes);
      // Persist to disk
      const panesFile = state.panesFile;
      if (panesFile) {
        try {
          const fs = await import('fs/promises');
          const path = await import('path');

          // Read current config
          let config: any = { panes: [] };
          try {
            const content = await fs.readFile(panesFile, 'utf-8');
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
              config = parsed;
            }
          } catch {}

          // Update panes in config
          config.panes = updatedPanes;

          // Write back
          await fs.writeFile(panesFile, JSON.stringify(config, null, 2), 'utf-8');
        } catch (error) {
          console.error('Failed to persist panes to disk:', error);
        }
      }
    },
    onPaneUpdate: (updatedPane) => {
      const currentPanes = stateManager.getPanes();
      const newPanes = currentPanes.map(p => p.id === updatedPane.id ? updatedPane : p);
      stateManager.updatePanes(newPanes);
      // Persist via savePanes
      context.savePanes(newPanes);
    },
    onPaneRemove: (removedPaneId) => {
      const currentPanes = stateManager.getPanes();
      const newPanes = currentPanes.filter(p => p.id !== removedPaneId);
      stateManager.updatePanes(newPanes);
      // Persist via savePanes
      context.savePanes(newPanes);
    },
  };

  try {
    // Execute the action
    const result = await executeAction(actionId as PaneAction, pane, context, params);

    // Convert to API response
    const apiResponse = actionResultToAPIResponse(result);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(apiResponse));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      type: 'error',
      message: `Action execution failed: ${error}`,
    }));
  }
}

/**
 * Handle POST /api/callbacks/confirm/:callbackId
 * Respond to a confirm dialog
 */
export async function handleConfirmCallback(
  req: IncomingMessage,
  res: ServerResponse,
  callbackId: string
): Promise<void> {
  const body = await readRequestBody(req);
  let confirmed = false;

  try {
    const data = JSON.parse(body);
    confirmed = data.confirmed === true;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Invalid request body',
    }));
    return;
  }

  try {
    const result = await handleConfirmResponse(callbackId, confirmed);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      type: 'error',
      message: `Callback execution failed: ${error}`,
    }));
  }
}

/**
 * Handle POST /api/callbacks/choice/:callbackId
 * Respond to a choice dialog
 */
export async function handleChoiceCallback(
  req: IncomingMessage,
  res: ServerResponse,
  callbackId: string
): Promise<void> {
  const body = await readRequestBody(req);
  let optionId: string;

  try {
    const data = JSON.parse(body);
    optionId = data.optionId;

    if (typeof optionId !== 'string') {
      throw new Error('Missing optionId');
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Invalid request body - missing optionId',
    }));
    return;
  }

  try {
    const result = await handleChoiceResponse(callbackId, optionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      type: 'error',
      message: `Callback execution failed: ${error}`,
    }));
  }
}

/**
 * Handle POST /api/callbacks/input/:callbackId
 * Respond to an input dialog
 */
export async function handleInputCallback(
  req: IncomingMessage,
  res: ServerResponse,
  callbackId: string
): Promise<void> {
  const body = await readRequestBody(req);
  let value: string;

  try {
    const data = JSON.parse(body);
    value = data.value || '';
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Invalid request body',
    }));
    return;
  }

  try {
    const result = await handleInputResponse(callbackId, value);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      type: 'error',
      message: `Callback execution failed: ${error}`,
    }));
  }
}

/**
 * Helper to read request body
 */
function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}
