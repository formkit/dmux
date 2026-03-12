import { describe, expect, it, vi, beforeEach } from 'vitest';

const popupMocks = vi.hoisted(() => ({
  launchNodePopupNonBlocking: vi.fn(),
}));

vi.mock('../src/utils/popup.js', () => ({
  launchNodePopupNonBlocking: popupMocks.launchNodePopupNonBlocking,
  POPUP_POSITIONING: {
    standard: () => ({}),
    centeredWithSidebar: () => ({}),
    large: () => ({}),
  },
}));

import { PopupManager, type PopupManagerConfig } from '../src/services/PopupManager.js';
import type { AgentName } from '../src/utils/agentLaunch.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function createPopupManager(
  trackProjectActivity: PopupManagerConfig['trackProjectActivity']
): PopupManager {
  const config: PopupManagerConfig = {
    sidebarWidth: 40,
    projectRoot: '/tmp/project',
    popupsSupported: true,
    isDevMode: false,
    terminalWidth: 120,
    terminalHeight: 40,
    availableAgents: ['claude', 'codex'] as AgentName[],
    settingsManager: {
      getSettings: () => ({}),
      getGlobalSettings: () => ({}),
      getProjectSettings: () => ({}),
    },
    projectSettings: {},
    trackProjectActivity,
  };

  return new PopupManager(config, () => {}, () => {});
}

describe('PopupManager popup readiness tracking', () => {
  beforeEach(() => {
    popupMocks.launchNodePopupNonBlocking.mockReset();
  });

  it('keeps project activity active until the popup reports ready', async () => {
    const ready = createDeferred<void>();
    const result = createDeferred<{ success: boolean; data: string }>();
    popupMocks.launchNodePopupNonBlocking.mockReturnValue({
      pid: 1,
      bounds: { x: 0, y: 0, width: 72, height: 12 },
      readyPromise: ready.promise,
      resultPromise: result.promise,
      kill: vi.fn(),
    });

    const activityEvents: string[] = [];
    const trackProjectActivity = vi.fn(async (work: () => Promise<unknown>) => {
      activityEvents.push('start');
      const value = await work();
      activityEvents.push('finish');
      return value;
    });

    const manager = createPopupManager(trackProjectActivity) as any;
    manager.checkPopupSupport = vi.fn(() => true);

    const popupPromise = manager.launchChoicePopup(
      'Choose AI Agent for Conflict Resolution',
      'Which agent would you like to use to resolve merge conflicts?',
      [{ id: 'claude', label: 'Claude', default: true }],
      undefined,
      '/tmp/project/feature'
    );

    await Promise.resolve();

    expect(activityEvents).toEqual(['start']);

    ready.resolve();
    await vi.waitFor(() => {
      expect(activityEvents).toEqual(['start', 'finish']);
    });

    result.resolve({ success: true, data: 'claude' });

    await expect(popupPromise).resolves.toBe('claude');
    expect(trackProjectActivity).toHaveBeenCalledWith(
      expect.any(Function),
      '/tmp/project/feature'
    );
  });
});
