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
      minPaneWidth: 50,
      maxPaneWidth: 80,
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

  it('stores minPaneWidth globally even when project scope is requested', async () => {
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

    expect(() => manager.updateSetting('minPaneWidth', 60, 'project')).not.toThrow();
    expect(manager.getSettings().minPaneWidth).toBe(60);
    expect(manager.getGlobalSettings().minPaneWidth).toBe(60);
    expect(manager.getProjectSettings().minPaneWidth).toBeUndefined();
  });

  it('stores maxPaneWidth globally even when project scope is requested', async () => {
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

    expect(() => manager.updateSetting('maxPaneWidth', 120, 'project')).not.toThrow();
    expect(manager.getSettings().maxPaneWidth).toBe(120);
    expect(manager.getGlobalSettings().maxPaneWidth).toBe(120);
    expect(manager.getProjectSettings().maxPaneWidth).toBeUndefined();
  });

  it('rejects out-of-range maxPaneWidth values', async () => {
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

    expect(() => manager.updateSetting('maxPaneWidth', 10, 'global')).toThrow('Invalid maxPaneWidth');
    expect(() => manager.updateSetting('maxPaneWidth', 500, 'global')).toThrow('Invalid maxPaneWidth');
    expect(() => manager.updateSetting('maxPaneWidth', 99.5, 'global')).toThrow('Invalid maxPaneWidth');
  });

  it('rejects out-of-range minPaneWidth values', async () => {
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

    expect(() => manager.updateSetting('minPaneWidth', 10, 'global')).toThrow('Invalid minPaneWidth');
    expect(() => manager.updateSetting('minPaneWidth', 500, 'global')).toThrow('Invalid minPaneWidth');
    expect(() => manager.updateSetting('minPaneWidth', 99.5, 'global')).toThrow('Invalid minPaneWidth');
  });

  it('updateSettings treats pane width bounds as global-only', async () => {
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

    manager.updateSettings({ minPaneWidth: 60, maxPaneWidth: 130 }, 'project');

    expect(manager.getGlobalSettings().minPaneWidth).toBe(60);
    expect(manager.getGlobalSettings().maxPaneWidth).toBe(130);
    expect(manager.getProjectSettings().minPaneWidth).toBeUndefined();
    expect(manager.getProjectSettings().maxPaneWidth).toBeUndefined();
    expect(manager.getSettings().minPaneWidth).toBe(60);
    expect(manager.getSettings().maxPaneWidth).toBe(130);
  });

  it('clamps maxPaneWidth to minPaneWidth when reducing max below min', async () => {
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

    manager.updateSetting('minPaneWidth', 50, 'global');
    manager.updateSetting('maxPaneWidth', 40, 'global');

    expect(manager.getSettings().minPaneWidth).toBe(50);
    expect(manager.getSettings().maxPaneWidth).toBe(50);
  });

  it('clamps minPaneWidth to maxPaneWidth when increasing min above max', async () => {
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

    manager.updateSetting('maxPaneWidth', 70, 'global');
    manager.updateSetting('minPaneWidth', 90, 'global');

    expect(manager.getSettings().minPaneWidth).toBe(70);
    expect(manager.getSettings().maxPaneWidth).toBe(70);
  });
});
