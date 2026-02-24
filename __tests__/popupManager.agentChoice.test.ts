import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createPopupManager(
  availableAgents: AgentName[],
  defaultAgent?: AgentName | ''
): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents,
    settingsManager: {
      getSettings: () => ({ defaultAgent }),
      getGlobalSettings: () => ({}),
      getProjectSettings: () => ({}),
    },
    projectSettings: {},
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager launchAgentChoicePopup', () => {
  it('passes configured default agent as initial selection when available', async () => {
    const manager = createPopupManager(['claude', 'codex'], 'codex') as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: ['codex'],
    });

    await manager.launchAgentChoicePopup();

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'agentChoicePopup.js',
      [JSON.stringify(['claude', 'codex']), JSON.stringify(['codex'])],
      expect.objectContaining({
        width: 72,
        title: 'Select Agent(s)',
      })
    );
  });

  it('passes an empty initial selection when configured default is unavailable', async () => {
    const manager = createPopupManager(['claude', 'opencode'], 'codex') as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: ['claude'],
    });

    await manager.launchAgentChoicePopup();

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'agentChoicePopup.js',
      [JSON.stringify(['claude', 'opencode']), JSON.stringify([])],
      expect.any(Object)
    );
  });
});
