import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateWelcomePane, mockWelcomePaneExists } = vi.hoisted(() => ({
  mockCreateWelcomePane: vi.fn(),
  mockWelcomePaneExists: vi.fn(),
}));

vi.mock('../src/utils/welcomePane.js', () => ({
  createWelcomePane: mockCreateWelcomePane,
  welcomePaneExists: mockWelcomePaneExists,
  destroyWelcomePane: vi.fn(),
}));

vi.mock('../src/services/LogService.js', () => ({
  LogService: {
    getInstance: () => ({
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { createWelcomePaneCoordinated } from '../src/utils/welcomePaneManager.js';

describe('welcomePaneManager', () => {
  let tempProjectRoot = '';
  let configPath = '';

  beforeEach(() => {
    vi.clearAllMocks();

    tempProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-welcome-pane-'));
    const dmuxDir = path.join(tempProjectRoot, '.dmux');
    fs.mkdirSync(dmuxDir, { recursive: true });
    configPath = path.join(dmuxDir, 'dmux.config.json');

    fs.writeFileSync(configPath, JSON.stringify({
      projectName: 'test-project',
      projectRoot: tempProjectRoot,
      panes: [],
      settings: {},
      lastUpdated: new Date().toISOString(),
      controlPaneId: '%1',
    }, null, 2));
  });

  afterEach(() => {
    if (tempProjectRoot && fs.existsSync(tempProjectRoot)) {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
  });

  it('creates welcome pane using project root as cwd', async () => {
    mockWelcomePaneExists.mockResolvedValue(false);
    mockCreateWelcomePane.mockResolvedValue('%77');

    const created = await createWelcomePaneCoordinated(tempProjectRoot, '%1');

    expect(created).toBe(true);
    expect(mockCreateWelcomePane).toHaveBeenCalledWith('%1', tempProjectRoot);

    const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(updatedConfig.welcomePaneId).toBe('%77');
  });
});
