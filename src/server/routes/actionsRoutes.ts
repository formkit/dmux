import {
  eventHandler,
  getRouterParams,
  setHeader,
  createRouter,
} from 'h3';
import {
  handleListActions,
  handleGetPaneActions,
  handleExecuteAction,
  handleConfirmCallback,
  handleChoiceCallback,
  handleInputCallback
} from '../actionsApi.js';

export function createActionsRoutes() {
  const router = createRouter();

  // GET /api/actions - List all actions
  router.get('/api/actions', eventHandler(async (event) => {
    return new Promise((resolve, reject) => {
      handleListActions(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any);
    });
  }));

  // GET /api/panes/:id/actions - Get available actions for pane
  router.get('/api/panes/:id/actions', eventHandler(async (event) => {
    const params = getRouterParams(event);
    const paneId = params?.id;

    if (!paneId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing pane ID' };
    }

    return new Promise((resolve, reject) => {
      handleGetPaneActions(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any, decodeURIComponent(paneId));
    });
  }));

  // POST /api/panes/:paneId/actions/:actionId - Execute action
  router.post('/api/panes/:paneId/actions/:actionId', eventHandler(async (event) => {
    const params = getRouterParams(event);
    const paneId = params?.paneId;
    const actionId = params?.actionId;

    if (!paneId || !actionId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing pane ID or action ID' };
    }

    return new Promise((resolve, reject) => {
      handleExecuteAction(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any, decodeURIComponent(paneId), decodeURIComponent(actionId));
    });
  }));

  // POST /api/callbacks/confirm/:callbackId - Respond to confirm dialog
  router.post('/api/callbacks/confirm/:callbackId', eventHandler(async (event) => {
    const params = getRouterParams(event);
    const callbackId = params?.callbackId;

    if (!callbackId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing callback ID' };
    }

    return new Promise((resolve, reject) => {
      handleConfirmCallback(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any, decodeURIComponent(callbackId));
    });
  }));

  // POST /api/callbacks/choice/:callbackId - Respond to choice dialog
  router.post('/api/callbacks/choice/:callbackId', eventHandler(async (event) => {
    const params = getRouterParams(event);
    const callbackId = params?.callbackId;

    if (!callbackId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing callback ID' };
    }

    return new Promise((resolve, reject) => {
      handleChoiceCallback(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any, decodeURIComponent(callbackId));
    });
  }));

  // POST /api/callbacks/input/:callbackId - Respond to input dialog
  router.post('/api/callbacks/input/:callbackId', eventHandler(async (event) => {
    const params = getRouterParams(event);
    const callbackId = params?.callbackId;

    if (!callbackId) {
      event.node.res.statusCode = 400;
      return { error: 'Missing callback ID' };
    }

    return new Promise((resolve, reject) => {
      handleInputCallback(event.node.req, {
        writeHead: (code: number, headers: any) => {
          event.node.res.statusCode = code;
          Object.entries(headers).forEach(([k, v]) => setHeader(event, k, v as string));
        },
        end: (data: string) => resolve(JSON.parse(data))
      } as any, decodeURIComponent(callbackId));
    });
  }));

  return router;
}
