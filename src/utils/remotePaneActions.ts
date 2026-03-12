import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildRemotePaneActionCommand } from './dmuxCommand.js';

export const DMUX_CONTROLLER_PID_OPTION = '@dmux_controller_pid';
export const DMUX_CONTROL_PANE_OPTION = '@dmux_control_pane';
export const DMUX_REMOTE_PANE_ACTION_TABLE = 'dmux-pane-action';
export const DMUX_REMOTE_PANE_MODE_OPTION = '@dmux_remote_pane_mode';
export const DMUX_REMOTE_PANE_MODE_PROMPT =
  'hit hotkey: j m x a b f A h H P r S';
export const DMUX_REMOTE_PANE_ACTION_TRIGGER_MESSAGE =
  'dmux pane mode active';

export const REMOTE_PANE_ACTION_SHORTCUTS = [
  'j',
  'm',
  'x',
  'a',
  'b',
  'f',
  'A',
  'h',
  'H',
  'P',
  'r',
  'S',
] as const;

export type RemotePaneActionShortcut = typeof REMOTE_PANE_ACTION_SHORTCUTS[number];

export interface RemotePaneActionRequest {
  type: 'pane-shortcut';
  targetPaneId: string;
  shortcut: RemotePaneActionShortcut;
  createdAt: string;
}

const REMOTE_TRIGGER_BINDINGS = [
  { key: 'M-D', noPrefix: true },
] as const;

function escapeForDoubleQuotes(value: string): string {
  return value.replace(/[\\$"`]/g, '\\$&');
}

function sanitizeSessionName(sessionName: string): string {
  return sessionName.replace(/[^A-Za-z0-9_.-]+/g, '-');
}

function buildQueueDrainPath(queuePath: string): string {
  return `${queuePath}.${process.pid}.${Date.now()}.drain`;
}

function buildSetRemoteModeCommand(): string {
  return `set-option -p -t "#{pane_id}" ${DMUX_REMOTE_PANE_MODE_OPTION} "${escapeForDoubleQuotes(
    DMUX_REMOTE_PANE_MODE_PROMPT
  )}"`;
}

function buildClearRemoteModeCommand(): string {
  return `set-option -u -p -t "#{pane_id}" ${DMUX_REMOTE_PANE_MODE_OPTION}`;
}

export function isRemotePaneActionShortcut(
  value: string
): value is RemotePaneActionShortcut {
  return REMOTE_PANE_ACTION_SHORTCUTS.includes(
    value as RemotePaneActionShortcut
  );
}

export function getCurrentTmuxSessionName(): string | null {
  try {
    const result = spawnSync('tmux', ['display-message', '-p', '#S'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      return null;
    }

    const sessionName = (result.stdout || '').trim();
    return sessionName || null;
  } catch {
    return null;
  }
}

export function getCurrentTmuxPaneId(): string | null {
  try {
    const result = spawnSync('tmux', ['display-message', '-p', '#{pane_id}'], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      return null;
    }

    const paneId = (result.stdout || '').trim();
    return paneId || null;
  } catch {
    return null;
  }
}

export function getTmuxSessionOption(
  sessionName: string,
  optionName: string
): string | null {
  try {
    const result = spawnSync(
      'tmux',
      ['show-options', '-v', '-t', sessionName, optionName],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );
    if (result.status !== 0) {
      return null;
    }

    const value = (result.stdout || '').trim();
    return value || null;
  } catch {
    return null;
  }
}

export function showTmuxMessage(message: string): void {
  try {
    spawnSync('tmux', ['display-message', '-d', '2500', message], {
      stdio: 'pipe',
    });
  } catch {
    // Best effort only.
  }
}

export function getRemotePaneActionQueuePath(
  sessionName: string,
  homeDir: string = os.homedir()
): string {
  return path.join(
    homeDir,
    '.dmux',
    'run',
    `${sanitizeSessionName(sessionName)}.remote-pane-actions.jsonl`
  );
}

export async function enqueueRemotePaneAction(
  sessionName: string,
  targetPaneId: string,
  shortcut: RemotePaneActionShortcut,
  homeDir?: string
): Promise<string> {
  const queuePath = getRemotePaneActionQueuePath(sessionName, homeDir);
  const request: RemotePaneActionRequest = {
    type: 'pane-shortcut',
    targetPaneId,
    shortcut,
    createdAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.appendFile(queuePath, `${JSON.stringify(request)}\n`, 'utf-8');

  return queuePath;
}

export async function clearRemotePaneActions(
  sessionName: string,
  homeDir?: string
): Promise<void> {
  const queuePath = getRemotePaneActionQueuePath(sessionName, homeDir);
  await fs.rm(queuePath, { force: true }).catch(() => undefined);
}

export async function drainRemotePaneActions(
  sessionName: string,
  homeDir?: string
): Promise<RemotePaneActionRequest[]> {
  const queuePath = getRemotePaneActionQueuePath(sessionName, homeDir);
  const drainPath = buildQueueDrainPath(queuePath);

  try {
    await fs.rename(queuePath, drainPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  try {
    const raw = await fs.readFile(drainPath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as Partial<RemotePaneActionRequest>;
          const shortcut = String(parsed.shortcut || '');
          if (
            parsed.type !== 'pane-shortcut'
            || typeof parsed.targetPaneId !== 'string'
            || !isRemotePaneActionShortcut(shortcut)
          ) {
            return [];
          }

          return [{
            type: 'pane-shortcut' as const,
            targetPaneId: parsed.targetPaneId,
            shortcut,
            createdAt: typeof parsed.createdAt === 'string'
              ? parsed.createdAt
              : new Date().toISOString(),
          }];
        } catch {
          return [];
        }
      });
  } finally {
    await fs.rm(drainPath, { force: true }).catch(() => undefined);
  }
}

export function buildRemotePaneActionBindingCommands(): string[] {
  const enterModeCommand = `display-message "${escapeForDoubleQuotes(
    DMUX_REMOTE_PANE_ACTION_TRIGGER_MESSAGE
  )}" \\; ${buildSetRemoteModeCommand()} \\; switch-client -T ${DMUX_REMOTE_PANE_ACTION_TABLE}`;

  const commands = REMOTE_TRIGGER_BINDINGS.map(({ key, noPrefix }) =>
    noPrefix
      ? `bind-key -n ${key} ${enterModeCommand}`
      : `bind-key ${key} ${enterModeCommand}`
  );

  commands.push(
    `bind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} Escape ${buildClearRemoteModeCommand()} \\; switch-client -T root`,
    `bind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} C-c ${buildClearRemoteModeCommand()} \\; switch-client -T root`
  );

  for (const shortcut of REMOTE_PANE_ACTION_SHORTCUTS) {
    const remoteActionCommand = `${buildRemotePaneActionCommand(shortcut)} >/dev/null 2>&1`;
    commands.push(
      `bind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} ${shortcut} ${buildClearRemoteModeCommand()} \\; run-shell "${escapeForDoubleQuotes(
        remoteActionCommand
      )}" \\; switch-client -T root`
    );
  }

  commands.push(
    `bind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} Any ${buildClearRemoteModeCommand()} \\; switch-client -T root`
  );

  return commands;
}

export function buildRemotePaneActionCleanupCommands(): string[] {
  const commands = REMOTE_TRIGGER_BINDINGS.map(({ key, noPrefix }) =>
    noPrefix ? `unbind-key -n ${key}` : `unbind-key ${key}`
  );

  commands.push(
    `unbind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} Escape`,
    `unbind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} C-c`,
    `unbind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} Any`
  );

  for (const shortcut of REMOTE_PANE_ACTION_SHORTCUTS) {
    commands.push(`unbind-key -T ${DMUX_REMOTE_PANE_ACTION_TABLE} ${shortcut}`);
  }

  return commands;
}
