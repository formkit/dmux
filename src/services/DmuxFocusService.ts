import { randomUUID } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { LogService } from './LogService.js';
import { TmuxService } from './TmuxService.js';
import {
  buildFocusToken,
  buildFocusWindowTitle,
  buildTerminalTitleSequence,
  mapTerminalProgramToBundleId,
  type DmuxHelperFocusStateMessage,
  type DmuxHelperSubscribeMessage,
} from '../utils/focusDetection.js';
import { resolvePackagePath } from '../utils/runtimePaths.js';

const HELPER_RECONNECT_DELAY_MS = 1000;
const HELPER_SOCKET_WAIT_TIMEOUT_MS = 5000;
const FOCUS_SYNC_INTERVAL_MS = 350;
const FOCUSED_PANE_WINDOW_STYLE = 'fg=default,bg=colour22';
const FOCUSED_PANE_WINDOW_ACTIVE_STYLE = 'fg=default,bg=colour28';

interface DmuxFocusServiceOptions {
  projectName: string;
}

interface StoredPaneStyle {
  windowStyle: string | null;
  windowActiveStyle: string | null;
}

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test'
    || process.env.VITEST === 'true'
    || typeof process.env.VITEST !== 'undefined';
}

function getHelperRuntimePaths(): {
  sourcePath: string;
  binaryPath: string;
  socketPath: string;
} {
  const helperBaseDir = path.join(os.homedir(), '.dmux', 'native-helper');
  return {
    sourcePath: resolvePackagePath('native', 'macos', 'dmux-helper.swift'),
    binaryPath: path.join(helperBaseDir, 'bin', 'dmux-helper-macos'),
    socketPath: path.join(helperBaseDir, 'run', 'dmux-helper.sock'),
  };
}

interface HelperBinaryStatus {
  ready: boolean;
  rebuilt: boolean;
}

function readTmuxGlobalEnvironment(name: string): string | undefined {
  if (!process.env.TMUX) {
    return undefined;
  }

  const result = spawnSync('tmux', ['show-environment', '-g', name], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return undefined;
  }

  const line = result.stdout.trim();
  if (!line || line === `-${name}`) {
    return undefined;
  }

  const prefix = `${name}=`;
  if (!line.startsWith(prefix)) {
    return undefined;
  }

  return line.slice(prefix.length);
}

function resolveTerminalProgram(): string | undefined {
  const terminalProgram = process.env.TERM_PROGRAM?.trim();
  if (terminalProgram && terminalProgram.toLowerCase() !== 'tmux') {
    return terminalProgram;
  }

  return readTmuxGlobalEnvironment('TERM_PROGRAM') ?? terminalProgram;
}

async function ensureHelperBinary(sourcePath: string, binaryPath: string): Promise<HelperBinaryStatus> {
  if (!existsSync(sourcePath)) {
    return { ready: false, rebuilt: false };
  }

  const needsBuild = !existsSync(binaryPath)
    || (await fs.stat(sourcePath)).mtimeMs > (await fs.stat(binaryPath).catch(() => ({ mtimeMs: 0 } as const))).mtimeMs;

  if (!needsBuild) {
    return { ready: true, rebuilt: false };
  }

  await fs.mkdir(path.dirname(binaryPath), { recursive: true });
  const result = spawnSync('swiftc', ['-O', sourcePath, '-o', binaryPath], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return {
    ready: result.status === 0,
    rebuilt: result.status === 0,
  };
}

function findHelperProcessIds(socketPath: string): number[] {
  const result = spawnSync('lsof', ['-t', '-U', socketPath], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value, index, values) => Number.isFinite(value) && value > 0 && value !== process.pid && values.indexOf(value) === index);
}

async function stopRunningHelper(socketPath: string): Promise<boolean> {
  const pids = findHelperProcessIds(socketPath);
  if (pids.length === 0) {
    return true;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore races where the helper exits between lookup and signal delivery.
    }
  }

  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const activePids = findHelperProcessIds(socketPath);
    if (activePids.length === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await fs.rm(socketPath, { force: true }).catch(() => undefined);
  return findHelperProcessIds(socketPath).length === 0;
}

async function waitForHelperSocket(socketPath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      const connected = await new Promise<boolean>((resolve) => {
        const probe = createConnection(socketPath);
        let settled = false;

        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          probe.destroy();
          resolve(value);
        };

        probe.once('connect', () => finish(true));
        probe.once('error', () => finish(false));
      });

      if (connected) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

async function ensureHelperRunning(
  logger: LogService
): Promise<string | null> {
  const { sourcePath, binaryPath, socketPath } = getHelperRuntimePaths();
  const binaryStatus = await ensureHelperBinary(sourcePath, binaryPath);

  if (!binaryStatus.ready) {
    logger.warn('dmux helper binary is unavailable on this system', 'focus-helper');
    return null;
  }

  const alreadyRunning = await waitForHelperSocket(socketPath, 250);
  if (alreadyRunning && !binaryStatus.rebuilt) {
    return socketPath;
  }

  if (alreadyRunning && binaryStatus.rebuilt) {
    const stopped = await stopRunningHelper(socketPath);
    if (!stopped) {
      logger.warn('Failed to restart dmux helper after rebuilding it', 'focus-helper');
      return socketPath;
    }
  }

  await fs.mkdir(path.dirname(socketPath), { recursive: true });
  const child = spawn(binaryPath, ['--socket', socketPath, '--poll-ms', '250'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const started = await waitForHelperSocket(socketPath, HELPER_SOCKET_WAIT_TIMEOUT_MS);
  if (!started) {
    logger.warn('Timed out waiting for dmux helper to start', 'focus-helper');
    return null;
  }

  return socketPath;
}

export class DmuxFocusService {
  private readonly logger = LogService.getInstance();
  private readonly tmuxService = TmuxService.getInstance();
  private readonly instanceId = randomUUID();
  private readonly token = buildFocusToken(this.instanceId);
  private readonly terminalProgram = resolveTerminalProgram();
  private readonly bundleId = mapTerminalProgramToBundleId(this.terminalProgram);
  private readonly terminalTitle: string;
  private readonly baseTitle: string;
  private helperSocketPath: string | null = null;
  private helperSocket: Socket | null = null;
  private helperFocused = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private lineBuffer = '';
  private active = false;
  private titleApplied = false;
  private styledPaneId: string | null = null;
  private storedPaneStyles = new Map<string, StoredPaneStyle>();

  constructor(private readonly options: DmuxFocusServiceOptions) {
    this.baseTitle = `dmux ${options.projectName}`;
    this.terminalTitle = buildFocusWindowTitle(options.projectName, this.token);
  }

  async start(): Promise<void> {
    if (process.platform !== 'darwin' || !process.env.TMUX || isTestEnvironment()) {
      return;
    }

    this.active = true;
    const helperSocketPath = await ensureHelperRunning(this.logger);
    if (!helperSocketPath) {
      return;
    }

    this.helperSocketPath = helperSocketPath;
    this.writeTerminalTitle(this.terminalTitle);
    this.titleApplied = true;

    this.syncInterval = setInterval(() => {
      void this.syncFocusedPaneTheme();
    }, FOCUS_SYNC_INTERVAL_MS);

    this.connectToHelper();
  }

  stop(): void {
    this.active = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.helperSocket) {
      this.helperSocket.destroy();
      this.helperSocket = null;
    }

    this.helperFocused = false;
    this.restoreFocusedPaneTheme();

    if (this.titleApplied) {
      this.writeTerminalTitle(this.baseTitle);
      this.titleApplied = false;
    }
  }

  private connectToHelper(): void {
    if (!this.active || !this.helperSocketPath) {
      return;
    }

    const socket = createConnection(this.helperSocketPath);
    this.helperSocket = socket;

    socket.on('connect', () => {
      const subscribeMessage: DmuxHelperSubscribeMessage = {
        type: 'subscribe',
        instanceId: this.instanceId,
        titleToken: this.token,
        bundleId: this.bundleId,
        terminalProgram: this.terminalProgram,
      };
      socket.write(`${JSON.stringify(subscribeMessage)}\n`);
    });

    socket.on('data', (chunk) => {
      this.lineBuffer += chunk.toString('utf-8');

      let newlineIndex = this.lineBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = this.lineBuffer.slice(0, newlineIndex).trim();
        this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
        if (line) {
          this.handleHelperMessage(line);
        }
        newlineIndex = this.lineBuffer.indexOf('\n');
      }
    });

    socket.on('error', () => {
      this.handleHelperDisconnect();
    });

    socket.on('close', () => {
      this.handleHelperDisconnect();
    });
  }

  private handleHelperMessage(line: string): void {
    try {
      const message = JSON.parse(line) as DmuxHelperFocusStateMessage;
      if (message.type !== 'focus-state' || message.instanceId !== this.instanceId) {
        return;
      }

      this.helperFocused = message.fullyFocused;
      void this.syncFocusedPaneTheme();
    } catch {
      // Ignore malformed helper output and keep current state.
    }
  }

  private handleHelperDisconnect(): void {
    if (this.helperSocket) {
      this.helperSocket.destroy();
      this.helperSocket = null;
    }

    this.helperFocused = false;
    void this.syncFocusedPaneTheme();

    if (!this.active || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectToHelper();
    }, HELPER_RECONNECT_DELAY_MS);
  }

  private async syncFocusedPaneTheme(): Promise<void> {
    if (!this.active || !this.helperFocused) {
      this.restoreFocusedPaneTheme();
      return;
    }

    try {
      const currentPaneId = await this.tmuxService.getCurrentPaneId();
      if (!currentPaneId) {
        this.restoreFocusedPaneTheme();
        return;
      }

      if (this.styledPaneId === currentPaneId) {
        return;
      }

      this.restoreFocusedPaneTheme();
      this.captureOriginalPaneStyle(currentPaneId);
      this.tmuxService.setPaneOptionSync(currentPaneId, 'window-style', FOCUSED_PANE_WINDOW_STYLE);
      this.tmuxService.setPaneOptionSync(currentPaneId, 'window-active-style', FOCUSED_PANE_WINDOW_ACTIVE_STYLE);
      this.styledPaneId = currentPaneId;
    } catch {
      this.restoreFocusedPaneTheme();
    }
  }

  private captureOriginalPaneStyle(paneId: string): void {
    if (this.storedPaneStyles.has(paneId)) {
      return;
    }

    const windowStyle = this.tmuxService.getPaneOptionSync(paneId, 'window-style') || null;
    const windowActiveStyle = this.tmuxService.getPaneOptionSync(paneId, 'window-active-style') || null;
    this.storedPaneStyles.set(paneId, { windowStyle, windowActiveStyle });
  }

  private restoreFocusedPaneTheme(): void {
    if (!this.styledPaneId) {
      return;
    }

    const paneId = this.styledPaneId;
    const storedStyle = this.storedPaneStyles.get(paneId);

    if (storedStyle?.windowStyle) {
      this.tmuxService.setPaneOptionSync(paneId, 'window-style', storedStyle.windowStyle);
    } else {
      this.tmuxService.unsetPaneOptionSync(paneId, 'window-style');
    }

    if (storedStyle?.windowActiveStyle) {
      this.tmuxService.setPaneOptionSync(paneId, 'window-active-style', storedStyle.windowActiveStyle);
    } else {
      this.tmuxService.unsetPaneOptionSync(paneId, 'window-active-style');
    }

    this.styledPaneId = null;
  }

  private writeTerminalTitle(title: string): void {
    process.stdout.write(
      buildTerminalTitleSequence(title, Boolean(process.env.TMUX))
    );
  }
}
