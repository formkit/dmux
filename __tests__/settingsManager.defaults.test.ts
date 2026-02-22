import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SettingsManager defaults', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses permissive built-in defaults when no settings files exist', async () => {
    vi.mock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    expect(manager.getSettings()).toMatchObject({
      permissionMode: 'bypassPermissions',
      enableAutopilotByDefault: true,
    });
  });

  it('allows overriding permissionMode with a valid value', async () => {
    vi.mock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    manager.updateSetting('permissionMode', 'acceptEdits', 'project');
    expect(manager.getSettings().permissionMode).toBe('acceptEdits');
  });

  it('rejects invalid permissionMode values', async () => {
    vi.mock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      };
    });

    const { SettingsManager } = await import('../src/utils/settingsManager.js');
    const manager = new SettingsManager('/tmp/test-project');

    expect(() => manager.updateSetting('permissionMode', 'fullAuto' as any, 'global')).toThrow(
      'Invalid permissionMode'
    );
  });
});
