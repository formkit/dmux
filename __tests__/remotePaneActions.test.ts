import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRemotePaneActionBindingCommands,
  buildRemotePaneActionCleanupCommands,
  clearRemotePaneActions,
  drainRemotePaneActions,
  enqueueRemotePaneAction,
  getRemotePaneActionQueuePath,
} from '../src/utils/remotePaneActions.js';

let tempHomeDir: string | null = null;

afterEach(async () => {
  if (tempHomeDir) {
    await fs.rm(tempHomeDir, { recursive: true, force: true });
    tempHomeDir = null;
  }
});

async function createTempHomeDir(): Promise<string> {
  tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dmux-remote-pane-actions-'));
  return tempHomeDir;
}

describe('remotePaneActions', () => {
  it('round-trips queued pane action requests without losing order', async () => {
    const homeDir = await createTempHomeDir();

    await enqueueRemotePaneAction('dmux-test', '%10', 'x', homeDir);
    await enqueueRemotePaneAction('dmux-test', '%11', 'm', homeDir);

    const drained = await drainRemotePaneActions('dmux-test', homeDir);

    expect(drained).toHaveLength(2);
    expect(drained[0]).toMatchObject({
      type: 'pane-shortcut',
      targetPaneId: '%10',
      shortcut: 'x',
    });
    expect(drained[1]).toMatchObject({
      type: 'pane-shortcut',
      targetPaneId: '%11',
      shortcut: 'm',
    });

    expect(await drainRemotePaneActions('dmux-test', homeDir)).toEqual([]);
  });

  it('ignores malformed queue entries while keeping valid actions', async () => {
    const homeDir = await createTempHomeDir();
    const queuePath = getRemotePaneActionQueuePath('dmux-test', homeDir);

    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.writeFile(
      queuePath,
      [
        JSON.stringify({ type: 'pane-shortcut', targetPaneId: '%20', shortcut: 'h' }),
        'not-json',
        JSON.stringify({ type: 'pane-shortcut', targetPaneId: '%21', shortcut: 'Z' }),
      ].join('\n'),
      'utf-8'
    );

    const drained = await drainRemotePaneActions('dmux-test', homeDir);

    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({
      targetPaneId: '%20',
      shortcut: 'h',
    });
  });

  it('clears the queue file explicitly', async () => {
    const homeDir = await createTempHomeDir();

    await enqueueRemotePaneAction('dmux-test', '%42', 'P', homeDir);
    await clearRemotePaneActions('dmux-test', homeDir);

    expect(await drainRemotePaneActions('dmux-test', homeDir)).toEqual([]);
  });

  it('builds trigger and cleanup commands for remote pane mode', () => {
    const setupCommands = buildRemotePaneActionBindingCommands();
    const cleanupCommands = buildRemotePaneActionCleanupCommands();

    expect(setupCommands[0]).toContain('bind-key -n M-D');
    expect(setupCommands[0]).toContain('@dmux_remote_pane_mode');
    expect(setupCommands[0]).toContain('hit hotkey: j m x a b f A h H P r S');
    expect(setupCommands.some((command) => command.includes('bind-key -T dmux-pane-action x set-option -u -p'))).toBe(true);
    expect(setupCommands.some((command) => command.includes('set-option -u -p -t "#{pane_id}" @dmux_remote_pane_mode'))).toBe(true);
    expect(setupCommands.some((command) => command.includes('--remote-pane-action x'))).toBe(true);
    expect(cleanupCommands).toContain('unbind-key -n M-D');
    expect(cleanupCommands).toContain('unbind-key -T dmux-pane-action x');
  });
});
