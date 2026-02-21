#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';

const cwd = process.cwd();
const entryRelative = process.env.DMUX_DEV_WATCH_ENTRY || path.join('dist', 'index.js');
const entryFile = path.resolve(cwd, entryRelative);
const watchDirectory = process.env.DMUX_DEV_WATCH_DIR
  ? path.resolve(cwd, process.env.DMUX_DEV_WATCH_DIR)
  : path.dirname(entryFile);

const RESTART_DEBOUNCE_MS = 150;
const CHILD_STOP_TIMEOUT_MS = 1500;

let child = null;
let shuttingDown = false;
let pendingRestart = false;
let restartTimer = null;

const childEnv = {
  ...process.env,
  DMUX_DEV: 'true',
  DMUX_DEV_WATCH: 'true',
};

const watcher = chokidar.watch(watchDirectory, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 120,
    pollInterval: 20,
  },
});

const clearRestartTimer = () => {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
};

const stopChild = async (signal = 'SIGTERM') => {
  if (!child) return;

  const activeChild = child;

  await new Promise((resolve) => {
    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    activeChild.once('exit', finalize);
    activeChild.once('error', finalize);

    try {
      activeChild.kill(signal);
    } catch {
      finalize();
      return;
    }

    setTimeout(() => {
      if (!settled) {
        try {
          activeChild.kill('SIGKILL');
        } catch {
          // Best effort.
        }
      }
      finalize();
    }, CHILD_STOP_TIMEOUT_MS);
  });
};

const startChild = () => {
  if (shuttingDown || child || !fs.existsSync(entryFile)) return;

  child = spawn(process.execPath, [entryFile], {
    cwd,
    stdio: 'inherit',
    env: childEnv,
  });

  child.once('exit', (code, signal) => {
    child = null;

    if (shuttingDown) {
      return;
    }

    if (pendingRestart) {
      pendingRestart = false;
      startChild();
      return;
    }

    // dmux quit intentionally; stop the watch loop so the pane returns to shell.
    if (!signal && code === 0) {
      void shutdown(0);
      return;
    }

    const status = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(
      `[dmux dev:watch] dmux exited with ${status}; waiting for rebuilt output to restart...`
    );
  });

  child.once('error', (error) => {
    console.error(`[dmux dev:watch] failed to start dmux runtime: ${error.message}`);
  });
};

const requestRestart = () => {
  if (shuttingDown || !fs.existsSync(entryFile)) return;

  pendingRestart = true;
  clearRestartTimer();
  restartTimer = setTimeout(async () => {
    clearRestartTimer();

    if (!child) {
      pendingRestart = false;
      startChild();
      return;
    }

    await stopChild('SIGTERM');
  }, RESTART_DEBOUNCE_MS);
};

const shutdown = async (exitCode = 0, signalToChild = null) => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearRestartTimer();
  pendingRestart = false;

  if (signalToChild) {
    await stopChild(signalToChild);
  }

  await watcher.close();
  process.exit(exitCode);
};

watcher.on('all', (event, changedPath) => {
  if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
  if (!changedPath.endsWith('.js') && !changedPath.endsWith('.mjs') && !changedPath.endsWith('.cjs')) {
    return;
  }
  requestRestart();
});
watcher.on('error', (error) => {
  console.error(`[dmux dev:watch] watcher error: ${error.message}`);
});

process.on('SIGINT', () => {
  void shutdown(0, 'SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown(0, 'SIGTERM');
});

if (fs.existsSync(entryFile)) {
  startChild();
} else {
  console.log(`[dmux dev:watch] waiting for ${entryRelative}...`);
}
