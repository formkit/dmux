import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalPlatform = process.platform;
const originalTmux = process.env.TMUX;
const originalNodeEnv = process.env.NODE_ENV;
const originalVitest = process.env.VITEST;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    throw new Error('spawn should not be called on unsupported platforms');
  }),
  spawnSync: vi.fn(() => {
    throw new Error('spawnSync should not be called on unsupported platforms');
  }),
}));

describe('dmux native helper progressive enhancement', () => {
  beforeEach(() => {
    vi.resetModules();
    setPlatform('linux');
    process.env.TMUX = '/tmp/tmux-test/default,123,0';
    delete process.env.VITEST;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    if (originalTmux === undefined) {
      delete process.env.TMUX;
    } else {
      process.env.TMUX = originalTmux;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
    }
  });

  it('skips native notification delivery entirely on non-macOS platforms', async () => {
    const { DmuxFocusService } = await import('../src/services/DmuxFocusService.js');
    const service = new DmuxFocusService({ projectName: 'dmux' });

    await expect(service.start()).resolves.toBeUndefined();
    await expect(
      service.sendAttentionNotification({
        title: 'test',
        subtitle: 'linux',
        body: 'should not use the helper',
        tmuxPaneId: '%1',
      })
    ).resolves.toBe(false);
  });
});
