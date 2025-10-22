import { eventHandler, readBody } from 'h3';
import { StateManager } from '../../shared/StateManager.js';
import { LogService } from '../../services/LogService.js';

const stateManager = StateManager.getInstance();

export function createSettingsRoutes() {
  return [
    // GET /api/session - Get session info
    {
      path: '/api/session',
      handler: eventHandler(async () => {
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
      })
    },

    // GET /api/settings - Get current settings (merged, global, and project)
    // PATCH /api/settings - Update a setting
    {
      path: '/api/settings',
      handler: eventHandler(async (event) => {
        if (event.node.req.method === 'GET') {
          const { SettingsManager, SETTING_DEFINITIONS } = await import('../../utils/settingsManager.js');
          const state = stateManager.getState();
          const projectRoot = state.projectRoot || process.cwd();

          const manager = new SettingsManager(projectRoot);

          return {
            settings: {
              merged: manager.getSettings(),
              global: manager.getGlobalSettings(),
              project: manager.getProjectSettings()
            },
            definitions: SETTING_DEFINITIONS
          };
        }

        // PATCH /api/settings - Update a setting
        if (event.node.req.method === 'PATCH') {
          try {
            const body = await readBody(event);
            const { key, value, scope } = body;

            if (!key || scope === undefined) {
              event.node.res.statusCode = 400;
              return { error: 'Missing key or scope' };
            }

            if (scope !== 'global' && scope !== 'project') {
              event.node.res.statusCode = 400;
              return { error: 'Invalid scope. Must be "global" or "project"' };
            }

            const { SettingsManager } = await import('../../utils/settingsManager.js');
            const state = stateManager.getState();
            const projectRoot = state.projectRoot || process.cwd();

            const manager = new SettingsManager(projectRoot);
            manager.updateSetting(key, value, scope);

            return {
              success: true,
              message: `Setting "${key}" updated at ${scope} level`
            };
          } catch (err: any) {
            const msg = 'Failed to update setting';
            console.error(msg, err);
            LogService.getInstance().error(msg, 'routes', undefined, err instanceof Error ? err : undefined);
            event.node.res.statusCode = 500;
            return { error: 'Failed to update setting', details: err.message };
          }
        }

        event.node.res.statusCode = 405;
        return { error: 'Method not allowed' };
      })
    },

    // GET /api/hooks - Get hooks status
    {
      path: '/api/hooks',
      handler: eventHandler(async (event) => {
        if (event.node.req.method === 'GET') {
          const { listAvailableHooks, hasHook } = await import('../../utils/hooks.js');
          const state = stateManager.getState();
          const projectRoot = state.projectRoot || process.cwd();

          // All possible hooks
          const allHookTypes = [
            'before_pane_create',
            'pane_created',
            'worktree_created',
            'before_pane_close',
            'pane_closed',
            'before_worktree_remove',
            'worktree_removed',
            'pre_merge',
            'post_merge',
            'run_test',
            'run_dev',
          ] as const;

          // Check status of each hook
          const hooks = allHookTypes.map(hookName => ({
            name: hookName,
            active: hasHook(projectRoot, hookName)
          }));

          return {
            hooks,
            activeCount: hooks.filter(h => h.active).length,
            totalCount: hooks.length
          };
        }

        event.node.res.statusCode = 405;
        return { error: 'Method not allowed' };
      })
    },

    // GET /api/logs - Get logs with optional filtering
    {
      path: '/api/logs',
      handler: eventHandler(async (event) => {
        if (event.node.req.method === 'GET') {
          const url = new URL(event.node.req.url || '', `http://${event.node.req.headers.host}`);
          const level = url.searchParams.get('level');
          const source = url.searchParams.get('source');
          const paneId = url.searchParams.get('paneId');
          const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

          const filter: any = {};
          if (level) filter.level = level;
          if (source) filter.source = source;
          if (paneId) filter.paneId = paneId;
          if (unreadOnly) filter.unreadOnly = true;

          const logs = stateManager.getLogs(filter);
          const stats = stateManager.getLogStats();

          return {
            logs,
            stats,
            timestamp: Date.now()
          };
        }

        event.node.res.statusCode = 405;
        return { error: 'Method not allowed' };
      })
    },

    // POST /api/logs/mark-read - Mark all logs as read
    {
      path: '/api/logs/mark-read',
      handler: eventHandler(async (event) => {
        if (event.node.req.method === 'POST') {
          stateManager.markAllLogsAsRead();
          return { success: true, message: 'All logs marked as read' };
        }

        event.node.res.statusCode = 405;
        return { error: 'Method not allowed' };
      })
    }
  ];
}
