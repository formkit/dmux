import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmuxPane } from '../src/types.js';

const tmuxServiceMock = vi.hoisted(() => ({
  setPaneTitle: vi.fn(async () => {}),
  sendKeys: vi.fn(async () => {}),
  sendShellCommand: vi.fn(async () => {}),
  sendTmuxKeys: vi.fn(async () => {}),
  selectLayout: vi.fn(async () => {}),
  refreshClient: vi.fn(async () => {}),
}));

const splitPaneMock = vi.hoisted(() => vi.fn(() => '%9'));

vi.mock('../src/services/TmuxService.js', () => ({
  TmuxService: {
    getInstance: vi.fn(() => tmuxServiceMock),
  },
}));

vi.mock('../src/utils/tmux.js', () => ({
  splitPane: splitPaneMock,
}));

vi.mock('../src/utils/geminiTrust.js', () => ({
  ensureGeminiFolderTrusted: vi.fn(),
}));

describe('pane restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    splitPaneMock.mockReturnValue('%9');
  });

  it('resumes restored worktree panes with their original agent command', async () => {
    const { recreateMissingPanes } = await import('../src/hooks/usePaneLoading.js');

    const pane: DmuxPane = {
      id: 'dmux-1',
      slug: 'feature-codex',
      prompt: 'fix the failing tests',
      paneId: '%2',
      worktreePath: '/repo/.dmux/worktrees/feature-codex',
      projectRoot: '/repo',
      agent: 'codex',
      permissionMode: 'bypassPermissions',
    };

    await recreateMissingPanes([pane], '/repo/.dmux/dmux.config.json');

    expect(tmuxServiceMock.sendShellCommand).toHaveBeenCalledWith(
      '%9',
      'codex resume --last --dangerously-bypass-approvals-and-sandbox'
    );
    expect(tmuxServiceMock.sendTmuxKeys).toHaveBeenCalledWith('%9', 'Enter');
  });
});
