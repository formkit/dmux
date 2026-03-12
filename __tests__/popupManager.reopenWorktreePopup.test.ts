import { describe, expect, it, vi } from 'vitest';
import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createPopupManager(availableAgents: AgentName[]): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project-root',
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
    trackProjectActivity: async (work) => await work(),
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager launchReopenWorktreePopup', () => {
  it('caps popup height and labels the selected project', async () => {
    const manager = createPopupManager(['claude', 'codex']) as any;
    manager.checkPopupSupport = vi.fn(() => true);
    manager.launchPopup = vi.fn().mockResolvedValue({
      success: false,
      cancelled: true,
    });

    const worktrees = Array.from({ length: 20 }, (_, index) => ({
      slug: `task-${index}`,
      path: `/tmp/project-selected/.dmux/worktrees/task-${index}`,
      lastModified: new Date(`2026-03-${String((index % 9) + 1).padStart(2, '0')}T12:00:00.000Z`),
      branch: `task-${index}`,
      hasUncommittedChanges: false,
    }));

    await manager.launchReopenWorktreePopup(worktrees, '/tmp/project-selected');

    expect(manager.launchPopup).toHaveBeenCalledWith(
      'reopenWorktreePopup.js',
      [],
      expect.objectContaining({
        height: 18,
        title: 'Reopen Closed Worktree: project-selected',
        width: 78,
      }),
      expect.objectContaining({
        projectName: 'project-selected',
      }),
      '/tmp/project-selected'
    );
  });
});
