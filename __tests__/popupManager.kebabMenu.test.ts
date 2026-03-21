import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { DmuxPane } from '../src/types.js';

function createPopupManager(): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents: ['claude', 'codex'],
    settingsManager: {
      getSettings: () => ({}),
      getGlobalSettings: () => ({}),
      getProjectSettings: () => ({}),
    },
    projectSettings: {},
    trackProjectActivity: async (work) => await work(),
  };

  return new PopupManager(config, () => {}, () => {});
}

function createPane(id: string): DmuxPane {
  return {
    id,
    slug: `pane-${id}`,
    displayName: `Pane ${id}`,
    prompt: `prompt-${id}`,
    paneId: `%${id}`,
    projectRoot: '/tmp/project',
    worktreePath: `/tmp/project/.dmux/worktrees/pane-${id}`,
  };
}

describe('PopupManager launchKebabMenuPopup', () => {
  it('anchors the popup to the target pane when requested', async () => {
    const manager = createPopupManager() as any;
    const pane = createPane('1');

    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: 'view',
    });

    await manager.launchKebabMenuPopup(pane, [pane], { anchorToPane: true });

    const [, popupArgs, popupOptions] = manager.launchPopup.mock.calls[0];
    const actions = JSON.parse(popupArgs[1]);

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'kebabMenuPopup.js',
      ['Pane 1', expect.any(String)],
      expect.objectContaining({
        width: 60,
        height: Math.min(21, actions.length + 6),
        title: 'Menu: Pane 1',
        positioning: 'pane',
        targetPaneId: pane.paneId,
      }),
      undefined,
      '/tmp/project'
    );
  });
});
