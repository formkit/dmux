import { eventHandler, readBody } from 'h3';
import { StateManager } from '../../shared/StateManager.js';
import { LogService } from '../../services/LogService.js';
import { TmuxService } from '../../services/TmuxService.js';

const stateManager = StateManager.getInstance();
const tmuxService = TmuxService.getInstance();

export function createKeysRoutes() {
  return [
    // POST /api/keys/:paneId - Send keystrokes to pane
    {
      path: '/api/keys',
      handler: eventHandler(async (event) => {
        // Only accept POST requests
        if (event.node.req.method !== 'POST') {
          event.node.res.statusCode = 405;
          return { error: 'Method not allowed' };
        }

        const url = event.node.req.url || '';
        const dmuxId = url.startsWith('/') ? url.substring(1) : url;

        if (!dmuxId || dmuxId.includes('/')) {
          event.node.res.statusCode = 404;
          return { error: 'Invalid pane ID' };
        }

        // Find the pane by dmux ID
        const pane = stateManager.getPaneById(decodeURIComponent(dmuxId));

        if (!pane || !pane.paneId) {
          event.node.res.statusCode = 404;
          return { error: 'Pane not found' };
        }

        // Read the keystroke data from the request body
        const body = await readBody(event);
        if (!body || typeof body.key !== 'string') {
          event.node.res.statusCode = 400;
          return { error: 'Missing or invalid key data' };
        }

        try {
          // Map special keys to tmux send-keys format
          const key = body.key;
          let tmuxKey = key;

          // Handle special keys
          const specialKeys: Record<string, string> = {
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Backspace': 'BSpace',
            'Delete': 'DC',      // Delete Character
            'Escape': 'Escape',
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
            'Space': 'Space'
          };

          // Priority order: Ctrl/Alt combinations first, then special keys, then regular

          // Handle Ctrl+ combinations with regular characters
          if (body.ctrlKey && key.length === 1 && !specialKeys[key]) {
            tmuxKey = `C-${key.toLowerCase()}`;
          }
          // Handle Alt+ combinations with regular characters
          else if (body.altKey && key.length === 1 && !specialKeys[key]) {
            tmuxKey = `M-${key.toLowerCase()}`;
          }
          // Handle Shift+Tab
          else if (body.shiftKey && key === 'Tab') {
            tmuxKey = 'BTab';
          }
          // Handle Shift+Enter - send the escape sequence using printf to handle escape character
          else if (body.shiftKey && key === 'Enter') {
            // Send ESC[13;2~ which is the standard Shift+Enter sequence
            const bufferName = 'dmux-shift-enter';
            await tmuxService.setBuffer(bufferName, '\x1b[13;2~');
            await tmuxService.pasteBuffer(bufferName, pane.paneId);
            await tmuxService.deleteBuffer(bufferName);
            return { success: true, key: 'Shift+Enter (CSI sequence)' };
          }
          // Handle Ctrl+ with special keys
          else if (body.ctrlKey && specialKeys[key]) {
            tmuxKey = `C-${specialKeys[key]}`;
          }
          // Handle Alt+ with special keys
          else if (body.altKey && specialKeys[key]) {
            tmuxKey = `M-${specialKeys[key]}`;
          }
          // Handle special keys alone
          else if (specialKeys[key]) {
            tmuxKey = specialKeys[key];
          }
          // Regular character - use sendKeys which handles literal flag
          else if (key.length === 1) {
            await tmuxService.sendKeys(pane.paneId, `-l ${JSON.stringify(key)}`);
            return { success: true, key: key };
          }

          // Send the key to tmux (for all non-literal keys)
          await tmuxService.sendKeys(pane.paneId, tmuxKey);

          return { success: true, key: tmuxKey };
        } catch (error: any) {
          const msg = 'Failed to send keys to pane';
          console.error(msg, error);
          LogService.getInstance().error(msg, 'routes', pane.id, error instanceof Error ? error : undefined);
          event.node.res.statusCode = 500;
          return { error: 'Failed to send keys', details: error.message };
        }
      })
    }
  ];
}
