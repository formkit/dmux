import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { ReopenWorktreePopupApp } from '../src/components/popups/reopenWorktreePopup.js';

const ESC = String.fromCharCode(27);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function down(stdin: { write: (value: string) => void }) {
  stdin.write(`${ESC}[B`);
  await sleep(5);
}

describe('ReopenWorktreePopupApp', () => {
  it('filters and scrolls the resumable branch list', async () => {
    const worktrees = Array.from({ length: 10 }, (_, index) => ({
      branchName: `task-${index}`,
      lastModified: index < 5
        ? `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`
        : undefined,
      hasUncommittedChanges: index % 2 === 0,
      hasWorktree: index % 2 === 0,
      hasLocalBranch: true,
      hasRemoteBranch: index % 3 === 0,
      isRemote: index % 3 === 0 && index % 2 !== 0,
    }));

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
        initialState={{
          includeWorktrees: true,
          includeLocalBranches: true,
          includeRemoteBranches: false,
          remoteLoaded: false,
          filterQuery: '',
        }}
      />
    );

    await sleep(20);

    let output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('Branch');
    expect(output).toContain('Last worked');
    expect(output).toContain('Search branches|');
    expect(output).toContain('Worktrees');
    expect(output).toContain('Local');
    expect(output).toContain('Remote');
    expect(output).toContain('task-0');
    expect(output).not.toContain('task-9');
    expect(output).toContain('2 below');
    expect(output).toContain('remote');

    stdin.write('9');
    await sleep(20);

    output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain(' 9|');
    expect(output).toContain('task-9');
    expect(output).not.toContain('task-0');
    expect(output).toContain('1 of 10 resumable branches');

    stdin.write('\u007f');
    await sleep(20);

    for (let count = 0; count < 8; count += 1) {
      await down(stdin);
    }

    output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('task-8');
    expect(output).toContain('task-9');
    expect(output).toContain('2 above');

    unmount();
  });

  it('filters by selected source toggles after remote branches are loaded', async () => {
    const worktrees = [
      {
        branchName: 'worktree-only',
        hasUncommittedChanges: false,
        hasWorktree: true,
        hasLocalBranch: false,
        hasRemoteBranch: false,
        isRemote: false,
      },
      {
        branchName: 'local-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: true,
        hasRemoteBranch: false,
        isRemote: false,
      },
      {
        branchName: 'remote-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: false,
        hasRemoteBranch: true,
        isRemote: true,
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
        initialState={{
          includeWorktrees: true,
          includeLocalBranches: true,
          includeRemoteBranches: true,
          remoteLoaded: true,
          filterQuery: '',
        }}
      />
    );

    await sleep(20);

    stdin.write('\t');
    await sleep(20);
    stdin.write('1');
    await sleep(20);
    stdin.write('2');
    await sleep(20);

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('remote-only');
    expect(output).not.toContain('worktree-only');
    expect(output).not.toContain('local-only');

    unmount();
  });

  it('reaches source filters from the list with the up arrow', async () => {
    const worktrees = [
      {
        branchName: 'local-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: true,
        hasRemoteBranch: false,
        isRemote: false,
      },
      {
        branchName: 'remote-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: false,
        hasRemoteBranch: true,
        isRemote: true,
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
        initialState={{
          includeWorktrees: true,
          includeLocalBranches: true,
          includeRemoteBranches: true,
          remoteLoaded: true,
          filterQuery: '',
        }}
      />
    );

    await sleep(20);
    stdin.write(`${ESC}[A`);
    await sleep(20);
    stdin.write('2');
    await sleep(20);

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('remote-only');
    expect(output).not.toContain('local-only');

    unmount();
  });

  it('keeps the no-match state compact when filtering to zero results', async () => {
    const worktrees = [
      {
        branchName: 'alpha',
        hasUncommittedChanges: false,
        hasWorktree: true,
        hasLocalBranch: true,
        hasRemoteBranch: false,
        isRemote: false,
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
        initialState={{
          includeWorktrees: true,
          includeLocalBranches: true,
          includeRemoteBranches: false,
          remoteLoaded: false,
          filterQuery: '',
        }}
      />
    );

    const initialOutput = stripAnsi(lastFrame() ?? '');
    const initialLineCount = initialOutput.split('\n').length;

    await sleep(20);
    stdin.write('z');
    await sleep(20);

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('No matches for "z"');
    expect(output).toContain('0 of 1 resumable branch');
    expect(output).toContain('Type filter');
    expect(output.split('\n').length).toBe(initialLineCount);

    unmount();
  });

  it('loads remote branches inline when the remote filter is enabled', async () => {
    const loadRemoteBranches = vi.fn(() => [
      {
        branchName: 'local-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: true,
        hasRemoteBranch: false,
        isRemote: false,
      },
      {
        branchName: 'remote-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: false,
        hasRemoteBranch: true,
        isRemote: true,
      },
    ]);

    const worktrees = [
      {
        branchName: 'local-only',
        hasUncommittedChanges: false,
        hasWorktree: false,
        hasLocalBranch: true,
        hasRemoteBranch: false,
        isRemote: false,
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
        projectRoot="/repo-selected"
        activePaneSlugs={[]}
        loadRemoteBranches={loadRemoteBranches}
        initialState={{
          includeWorktrees: true,
          includeLocalBranches: true,
          includeRemoteBranches: true,
          remoteLoaded: false,
          filterQuery: '',
        }}
      />
    );

    await sleep(50);

    const output = stripAnsi(lastFrame() ?? '');
    expect(loadRemoteBranches).toHaveBeenCalledWith('/repo-selected', []);
    expect(output).toContain('remote-only');
    expect(output).toContain('Remote');

    unmount();
  });
});
