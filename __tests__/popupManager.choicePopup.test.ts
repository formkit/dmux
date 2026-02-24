import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createPopupManager(availableAgents: AgentName[]): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents,
    settingsManager: {
      getSettings: () => ({}),
      getGlobalSettings: () => ({}),
      getProjectSettings: () => ({}),
    },
    projectSettings: {},
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager launchChoicePopup', () => {
  it('routes merge uncommitted dialogs to mergeUncommittedChoicePopup', async () => {
    const manager = createPopupManager(['claude', 'codex']) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: 'commit_automatic',
    });

    const mergeData = {
      kind: 'merge_uncommitted',
      repoPath: '/tmp/project',
      targetBranch: 'main',
      files: ['src/index.ts'],
      diffMode: 'target-branch',
    };

    await manager.launchChoicePopup(
      'Main Branch Has Uncommitted Changes',
      'Resolve before merge',
      [{ id: 'commit_automatic', label: 'AI commit' }],
      mergeData
    );

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'mergeUncommittedChoicePopup.js',
      [],
      expect.objectContaining({
        title: 'Main Branch Has Uncommitted Changes',
      }),
      expect.objectContaining(mergeData)
    );
  });

  it('keeps generic choice popup behavior for non-merge choice data', async () => {
    const manager = createPopupManager(['claude', 'codex']) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: true,
      data: 'cancel',
    });

    await manager.launchChoicePopup(
      'Choose Option',
      'Pick one',
      [{ id: 'cancel', label: 'Cancel' }],
      { kind: 'not_merge_uncommitted' }
    );

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'choicePopup.js',
      [],
      expect.any(Object),
      {
        title: 'Choose Option',
        message: 'Pick one',
        options: [{ id: 'cancel', label: 'Cancel' }],
      }
    );
  });
});
