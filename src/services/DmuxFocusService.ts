import { createHash, randomUUID } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { EventEmitter } from 'events';
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
  parseTmuxSocketPath,
  supportsNativeDmuxHelper,
  type DmuxHelperFocusStateMessage,
  type DmuxHelperNotifyMessage,
  type DmuxHelperSubscribeMessage,
} from '../utils/focusDetection.js';
import { resolvePackagePath } from '../utils/runtimePaths.js';

const HELPER_RECONNECT_DELAY_MS = 1000;
const HELPER_SOCKET_WAIT_TIMEOUT_MS = 5000;
const FOCUS_SYNC_INTERVAL_MS = 350;

interface DmuxFocusServiceOptions {
  projectName: string;
}

export interface DmuxFocusChangedEvent {
  fullyFocusedPaneId: string | null;
  helperFocused: boolean;
}

export interface DmuxAttentionNotificationRequest {
  title: string;
  subtitle?: string;
  body: string;
  tmuxPaneId: string;
}

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test'
    || process.env.VITEST === 'true'
    || typeof process.env.VITEST !== 'undefined';
}

function getHelperRuntimePaths(): {
  sourcePath: string;
  infoPlistSourcePath: string;
  iconSourcePath: string;
  appPath: string;
  executablePath: string;
  resourcesPath: string;
  infoPlistPath: string;
  bundleIconPngPath: string;
  bundleIconIcnsPath: string;
  versionPath: string;
  socketPath: string;
} {
  const helperBaseDir = path.join(os.homedir(), '.dmux', 'native-helper');
  const appPath = path.join(helperBaseDir, 'dmux-helper.app');
  const contentsPath = path.join(appPath, 'Contents');
  const resourcesPath = path.join(contentsPath, 'Resources');
  return {
    sourcePath: resolvePackagePath('native', 'macos', 'dmux-helper.swift'),
    infoPlistSourcePath: resolvePackagePath('native', 'macos', 'dmux-helper-Info.plist'),
    iconSourcePath: resolvePackagePath('native', 'macos', 'dmux-helper-icon.png'),
    appPath,
    executablePath: path.join(contentsPath, 'MacOS', 'dmux-helper'),
    resourcesPath,
    infoPlistPath: path.join(contentsPath, 'Info.plist'),
    bundleIconPngPath: path.join(resourcesPath, 'dmux-helper.png'),
    bundleIconIcnsPath: path.join(resourcesPath, 'dmux-helper.icns'),
    versionPath: path.join(helperBaseDir, 'version.txt'),
    socketPath: path.join(helperBaseDir, 'run', 'dmux-helper.sock'),
  };
}

interface HelperBinaryStatus {
  ready: boolean;
  rebuilt: boolean;
}

const HELPER_BUNDLE_BUILD_VERSION = '1';

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

function resolveTmuxSocketPath(): string | undefined {
  const parsedFromEnv = parseTmuxSocketPath(process.env.TMUX);
  if (parsedFromEnv) {
    return parsedFromEnv;
  }

  if (!process.env.TMUX) {
    return undefined;
  }

  const result = spawnSync('tmux', ['display-message', '-p', '#{socket_path}'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return undefined;
  }

  const socketPath = result.stdout.trim();
  return socketPath || undefined;
}

function buildHelperVersionHash(parts: string[]): string {
  const hash = createHash('sha1');
  hash.update(HELPER_BUNDLE_BUILD_VERSION);
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest('hex');
}

function runBuildTool(executable: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(executable, args, {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  return {
    ok: result.status === 0,
    output: (result.stderr || result.stdout || '').trim(),
  };
}

async function buildHelperBundleIcon(iconSourcePath: string, iconIcnsPath: string): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dmux-helper-icon-'));
  const iconsetDir = path.join(tempDir, 'dmux-helper.iconset');

  try {
    await fs.mkdir(iconsetDir, { recursive: true });
    const sizes = [16, 32, 128, 256, 512];

    for (const size of sizes) {
      const oneX = path.join(iconsetDir, `icon_${size}x${size}.png`);
      const twoX = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);

      let result = runBuildTool('/usr/bin/sips', [
        '-z',
        String(size),
        String(size),
        iconSourcePath,
        '--out',
        oneX,
      ]);
      if (!result.ok) {
        throw new Error(result.output || 'sips failed building helper icon');
      }

      result = runBuildTool('/usr/bin/sips', [
        '-z',
        String(size * 2),
        String(size * 2),
        iconSourcePath,
        '--out',
        twoX,
      ]);
      if (!result.ok) {
        throw new Error(result.output || 'sips failed building helper icon');
      }
    }

    const iconutilResult = runBuildTool('/usr/bin/iconutil', [
      '-c',
      'icns',
      iconsetDir,
      '-o',
      iconIcnsPath,
    ]);
    if (!iconutilResult.ok) {
      throw new Error(iconutilResult.output || 'iconutil failed building helper icon');
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureHelperBundle(
  paths: ReturnType<typeof getHelperRuntimePaths>
): Promise<HelperBinaryStatus> {
  if (!existsSync(paths.sourcePath) || !existsSync(paths.infoPlistSourcePath)) {
    return { ready: false, rebuilt: false };
  }

  const [sourceTemplate, infoPlistTemplate, iconBuffer, currentVersion] = await Promise.all([
    fs.readFile(paths.sourcePath, 'utf-8'),
    fs.readFile(paths.infoPlistSourcePath, 'utf-8'),
    existsSync(paths.iconSourcePath)
      ? fs.readFile(paths.iconSourcePath)
      : Promise.resolve<Buffer | null>(null),
    existsSync(paths.versionPath)
      ? fs.readFile(paths.versionPath, 'utf-8').catch(() => '')
      : Promise.resolve(''),
  ]);

  const expectedVersion = buildHelperVersionHash([
    sourceTemplate,
    infoPlistTemplate,
    iconBuffer?.toString('base64') || 'no-icon',
  ]);

  const needsBuild = !existsSync(paths.executablePath)
    || !existsSync(paths.infoPlistPath)
    || (iconBuffer !== null && !existsSync(paths.bundleIconPngPath))
    || currentVersion.trim() !== expectedVersion;

  if (!needsBuild) {
    return { ready: true, rebuilt: false };
  }

  await fs.rm(paths.appPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(paths.executablePath), { recursive: true });
  await fs.mkdir(paths.resourcesPath, { recursive: true });
  await fs.writeFile(paths.infoPlistPath, infoPlistTemplate, 'utf-8');

  if (iconBuffer !== null) {
    await fs.writeFile(paths.bundleIconPngPath, iconBuffer);
    try {
      await buildHelperBundleIcon(paths.bundleIconPngPath, paths.bundleIconIcnsPath);
    } catch {
      // The helper can still set the bundled PNG as its runtime icon.
    }
  }

  const result = spawnSync('swiftc', [
    '-O',
    paths.sourcePath,
    '-o',
    paths.executablePath,
    '-framework',
    'AppKit',
    '-framework',
    'ApplicationServices',
  ], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return { ready: false, rebuilt: false };
  }

  await fs.writeFile(paths.versionPath, expectedVersion, 'utf-8');
  return {
    ready: true,
    rebuilt: true,
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
  const helperPaths = getHelperRuntimePaths();
  const { executablePath, socketPath } = helperPaths;
  const binaryStatus = await ensureHelperBundle(helperPaths);

  if (!binaryStatus.ready) {
    logger.warn('dmux helper app bundle is unavailable on this system', 'focus-helper');
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
  const child = spawn(executablePath, ['--socket', socketPath, '--poll-ms', '250'], {
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

export class DmuxFocusService extends EventEmitter {
  private readonly logger = LogService.getInstance();
  private readonly tmuxService = TmuxService.getInstance();
  private readonly instanceId = randomUUID();
  private readonly token = buildFocusToken(this.instanceId);
  private readonly terminalProgram = supportsNativeDmuxHelper()
    ? resolveTerminalProgram()
    : undefined;
  private readonly bundleId = mapTerminalProgramToBundleId(this.terminalProgram);
  private readonly tmuxSocketPath = supportsNativeDmuxHelper()
    ? resolveTmuxSocketPath()
    : undefined;
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
  private fullyFocusedPaneId: string | null = null;

  constructor(private readonly options: DmuxFocusServiceOptions) {
    super();
    this.baseTitle = `dmux ${options.projectName}`;
    this.terminalTitle = buildFocusWindowTitle(options.projectName, this.token);
  }

  async start(): Promise<void> {
    if (!supportsNativeDmuxHelper() || !process.env.TMUX || isTestEnvironment()) {
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
      void this.syncFocusedPaneState();
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
    this.setFullyFocusedPaneId(null);

    if (this.titleApplied) {
      this.writeTerminalTitle(this.baseTitle);
      this.titleApplied = false;
    }
  }

  private connectToHelper(): void {
    if (!this.active || !this.helperSocketPath) {
      return;
    }

    this.lineBuffer = '';
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
      void this.syncFocusedPaneState();
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
    this.setFullyFocusedPaneId(null);

    if (!this.active || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectToHelper();
    }, HELPER_RECONNECT_DELAY_MS);
  }

  getFullyFocusedPaneId(): string | null {
    return this.fullyFocusedPaneId;
  }

  isPaneFullyFocused(paneId: string): boolean {
    return this.fullyFocusedPaneId === paneId;
  }

  async sendAttentionNotification(
    request: DmuxAttentionNotificationRequest
  ): Promise<boolean> {
    if (!supportsNativeDmuxHelper() || isTestEnvironment()) {
      return false;
    }

    const socketPath = await this.ensureHelperSocketPath();
    if (!socketPath) {
      return false;
    }

    const payload: DmuxHelperNotifyMessage = {
      type: 'notify',
      title: request.title,
      subtitle: request.subtitle,
      body: request.body,
      titleToken: this.token,
      bundleId: this.bundleId,
      tmuxPaneId: request.tmuxPaneId,
      tmuxSocketPath: this.tmuxSocketPath,
    };

    return new Promise<boolean>((resolve) => {
      const socket = createConnection(socketPath);
      let settled = false;

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(value);
      };

      socket.once('connect', () => {
        socket.write(`${JSON.stringify(payload)}\n`, (error) => {
          finish(!error);
        });
      });

      socket.once('error', () => {
        finish(false);
      });
    });
  }

  private async ensureHelperSocketPath(): Promise<string | null> {
    if (this.helperSocketPath) {
      const helperReady = await waitForHelperSocket(this.helperSocketPath, 100);
      if (helperReady) {
        return this.helperSocketPath;
      }
    }

    const helperSocketPath = await ensureHelperRunning(this.logger);
    if (!helperSocketPath) {
      return null;
    }

    this.helperSocketPath = helperSocketPath;
    return helperSocketPath;
  }

  private async syncFocusedPaneState(): Promise<void> {
    if (!this.active || !this.helperFocused) {
      this.setFullyFocusedPaneId(null);
      return;
    }

    try {
      const currentPaneId = await this.tmuxService.getCurrentPaneId();
      if (!currentPaneId) {
        this.setFullyFocusedPaneId(null);
        return;
      }

      this.setFullyFocusedPaneId(currentPaneId);
    } catch {
      this.setFullyFocusedPaneId(null);
    }
  }

  private setFullyFocusedPaneId(paneId: string | null): void {
    if (this.fullyFocusedPaneId === paneId) {
      return;
    }

    this.fullyFocusedPaneId = paneId;
    this.emit('focus-changed', {
      fullyFocusedPaneId: paneId,
      helperFocused: this.helperFocused,
    } satisfies DmuxFocusChangedEvent);
  }

  private writeTerminalTitle(title: string): void {
    process.stdout.write(
      buildTerminalTitleSequence(title, Boolean(process.env.TMUX))
    );
  }
}
