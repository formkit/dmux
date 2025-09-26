import net from 'net';

/**
 * Find an available port, trying preferred ports first
 */
export async function findAvailablePort(preferredPorts: number[] = []): Promise<number> {
  // Try preferred ports first
  for (const port of preferredPorts) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  // Try random ports in the 42000-43000 range
  for (let i = 0; i < 100; i++) {
    const port = Math.floor(Math.random() * 1000) + 42000;
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  // Fallback to any available port
  return getRandomPort();
}

/**
 * Check if a specific port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Get a random available port (system-assigned)
 */
async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (err) => {
      reject(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}