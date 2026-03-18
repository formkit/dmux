import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KebabMenuPopupApp } from '../src/components/popups/kebabMenuPopup.js';
import type { PaneMenuAction } from '../src/actions/types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('KebabMenuPopupApp', () => {
  it('selects a menu action from its visible shortcut', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-kebab-popup-'));
    tempDirs.push(tempDir);
    const resultFile = path.join(tempDir, 'result.json');

    const actions: PaneMenuAction[] = [
      {
        id: 'view',
        label: 'View',
        description: 'Jump to this pane',
        shortcut: 'j',
      },
      {
        id: 'close',
        label: 'Close',
        description: 'Close this pane',
        shortcut: 'x',
      },
    ];

    const { stdin, unmount } = render(
      <KebabMenuPopupApp
        resultFile={resultFile}
        paneName="pane-1"
        actions={actions}
      />
    );

    await sleep(30);
    stdin.write('x');
    await sleep(30);

    expect(JSON.parse(fs.readFileSync(resultFile, 'utf8'))).toEqual({
      success: true,
      data: 'close',
    });

    unmount();
  });
});
