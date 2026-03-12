import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useInputHandling } from '../src/hooks/useInputHandling.js';
import type { ProjectActionItem } from '../src/utils/projectActions.js';
import { getOrphanedWorktrees } from '../src/utils/git.js';

vi.mock('../src/utils/git.js', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/git.js')>('../src/utils/git.js');
  return {
    ...actual,
    getOrphanedWorktrees: vi.fn(),
  };
});

vi.mock('../src/utils/remotePaneActions.js', () => ({
  drainRemotePaneActions: vi.fn(async () => []),
  getCurrentTmuxSessionName: vi.fn(() => null),
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Harness({
  selectedIndex,
  projectActionItems,
  popupManager,
}: {
  selectedIndex: number;
  projectActionItems: ProjectActionItem[];
  popupManager: any;
}) {
  useInputHandling({
    panes: [],
    selectedIndex,
    setSelectedIndex: vi.fn(),
    isCreatingPane: false,
    setIsCreatingPane: vi.fn(),
    runningCommand: false,
    isUpdating: false,
    isLoading: false,
    ignoreInput: false,
    isDevMode: false,
    quitConfirmMode: false,
    setQuitConfirmMode: vi.fn(),
    showCommandPrompt: null,
    setShowCommandPrompt: vi.fn(),
    commandInput: '',
    setCommandInput: vi.fn(),
    showFileCopyPrompt: false,
    setShowFileCopyPrompt: vi.fn(),
    currentCommandType: null,
    setCurrentCommandType: vi.fn(),
    projectSettings: {},
    saveSettings: vi.fn(),
    settingsManager: {},
    popupManager,
    actionSystem: {
      actionState: {},
      executeAction: vi.fn(),
      executeCallback: vi.fn(),
      clearDialog: vi.fn(),
      clearStatus: vi.fn(),
      setActionState: vi.fn(),
    },
    controlPaneId: undefined,
    setStatusMessage: vi.fn(),
    copyNonGitFiles: vi.fn(),
    runCommandInternal: vi.fn(),
    handlePaneCreationWithAgent: vi.fn(),
    handleCreateChildWorktree: vi.fn(),
    handleReopenWorktree: vi.fn(),
    setDevSourceFromPane: vi.fn(),
    savePanes: vi.fn(),
    sidebarProjects: [
      { projectRoot: '/repo-root', projectName: 'repo-root' },
      { projectRoot: '/repo-selected', projectName: 'repo-selected' },
    ],
    saveSidebarProjects: vi.fn(async (projects) => projects),
    loadPanes: vi.fn(),
    cleanExit: vi.fn(),
    availableAgents: [],
    panesFile: '/tmp/dmux.config.json',
    projectRoot: '/repo-root',
    projectActionItems,
    findCardInDirection: vi.fn(() => null),
  });

  return <Text>dmux</Text>;
}

describe('useInputHandling reopen project selection', () => {
  it('reopens closed worktrees for the currently selected sidebar project', async () => {
    const orphanedWorktrees = [
      {
        slug: 'feature-a',
        path: '/repo-selected/.dmux/worktrees/feature-a',
        lastModified: new Date('2026-03-12T12:00:00.000Z'),
        branch: 'feature-a',
        hasUncommittedChanges: false,
      },
    ];
    vi.mocked(getOrphanedWorktrees).mockReturnValue(orphanedWorktrees);

    const popupManager = {
      launchReopenWorktreePopup: vi.fn(async () => null),
    };

    const projectActionItems: ProjectActionItem[] = [
      {
        index: 0,
        projectRoot: '/repo-selected',
        projectName: 'repo-selected',
        kind: 'new-agent',
        hotkey: 'n',
      },
    ];

    const { stdin, unmount } = render(
      <Harness
        selectedIndex={0}
        projectActionItems={projectActionItems}
        popupManager={popupManager}
      />
    );

    await sleep(20);
    stdin.write('r');
    await sleep(40);

    expect(getOrphanedWorktrees).toHaveBeenCalledWith('/repo-selected', []);
    expect(popupManager.launchReopenWorktreePopup).toHaveBeenCalledWith(
      orphanedWorktrees,
      '/repo-selected'
    );

    unmount();
  });
});
