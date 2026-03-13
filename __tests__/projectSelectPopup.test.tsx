import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProjectSelectApp } from '../src/components/popups/projectSelectPopup.js';

const tempDirs: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-project-select-popup-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ProjectSelectApp', () => {
  it('shows a create-project hint when the selected path does not exist', async () => {
    const tempDir = makeTempDir();
    const missingPath = path.join(tempDir, 'new-project');
    const resultFile = path.join(tempDir, 'result.json');

    const { lastFrame, unmount } = render(
      <ProjectSelectApp resultFile={resultFile} defaultValue={missingPath} />
    );

    await sleep(40);

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'Hit Enter to create a new project at this location.'
    );

    unmount();
  });

  it('does not show the create-project hint for an existing path', async () => {
    const tempDir = makeTempDir();
    const existingPath = path.join(tempDir, 'existing-project');
    fs.mkdirSync(existingPath, { recursive: true });
    const resultFile = path.join(tempDir, 'result.json');

    const { lastFrame, unmount } = render(
      <ProjectSelectApp resultFile={resultFile} defaultValue={existingPath} />
    );

    await sleep(40);

    expect(stripAnsi(lastFrame() ?? '')).not.toContain(
      'Hit Enter to create a new project at this location.'
    );

    unmount();
  });
});
