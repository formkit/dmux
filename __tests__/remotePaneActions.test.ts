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

  it('builds trigger and cleanup commands for the focused-pane menu shortcut', () => {
    const setupCommands = buildRemotePaneActionBindingCommands();
    const cleanupCommands = buildRemotePaneActionCleanupCommands();

    expect(setupCommands).toHaveLength(1);
    expect(setupCommands[0]).toContain('bind-key -n M-M');
    expect(setupCommands[0]).toContain('--remote-pane-action m');
    expect(cleanupCommands.some((command) => command.includes('unbind-key -n M-M'))).toBe(true);
    expect(cleanupCommands.some((command) => command.includes('unbind-key -n M-D'))).toBe(true);
    expect(cleanupCommands.some((command) => command.includes('unbind-key -T dmux-pane-action x'))).toBe(true);
  });
});
