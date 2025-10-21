/**
 * Legacy routes.ts - Re-exports from modular route structure
 *
 * This file maintains backward compatibility while delegating to the new
 * modular route system in src/server/routes/
 *
 * Route organization:
 * - panesRoutes.ts - Pane CRUD, snapshot, test/dev status
 * - streamRoutes.ts - SSE streaming endpoints
 * - keysRoutes.ts - Keystroke input endpoints
 * - actionsRoutes.ts - Action system endpoints
 * - settingsRoutes.ts - Settings, session, hooks, logs
 * - tunnelRoutes.ts - Remote tunnel creation
 * - healthRoutes.ts - Health check + static file serving
 */

export { setupRoutes } from './routes/index.js';
