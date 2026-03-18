import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RemotePaneActionShortcut } from './remotePaneActions.js';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolveDmuxExecutable(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const localDmuxPath = path.resolve(currentDir, '..', '..', 'dmux');

  if (fs.existsSync(localDmuxPath)) {
    return localDmuxPath;
  }

  return 'dmux';
}

export function buildFilesOnlyCommand(): string {
  return `${shellQuote(resolveDmuxExecutable())} --files-only`;
}

export function buildRemotePaneActionCommand(
  shortcut: RemotePaneActionShortcut
): string {
  return `${shellQuote(resolveDmuxExecutable())} --remote-pane-action ${shortcut}`;
}
