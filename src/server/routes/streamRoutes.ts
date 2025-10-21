import { eventHandler } from 'h3';
import { StateManager } from '../../shared/StateManager.js';
import { getTerminalStreamer } from '../../services/TerminalStreamer.js';
import { formatStreamMessage, type HeartbeatMessage } from '../../shared/StreamProtocol.js';

const stateManager = StateManager.getInstance();

export function createStreamRoutes() {
  return [
    // GET /api/stream/:paneId - Stream terminal output
    {
      path: '/api/stream',
      handler: eventHandler(async (event) => {
        const url = event.node.req.url || '';
        // When using app.use('/api/stream'), the URL is already stripped
        // So we just need to remove the leading slash
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
      })
    },

    // GET /api/stream-stats - Get streaming statistics
    {
      path: '/api/stream-stats',
      handler: eventHandler(async () => {
        const streamer = getTerminalStreamer();
        return streamer.getStats();
      })
    },

    // GET /api/test-stream - Simple test stream
    {
      path: '/api/test-stream',
      handler: eventHandler(async (event) => {
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
      })
    }
  ];
}
