import React from 'react';
import { describe, expect, it } from 'vitest';
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
  it('keeps the list inside the popup and scrolls entries into view', async () => {
    const worktrees = Array.from({ length: 10 }, (_, index) => ({
      slug: `task-${index}`,
      path: `/tmp/project/.dmux/worktrees/task-${index}`,
      lastModified: `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      branch: `task-${index}`,
      hasUncommittedChanges: index % 2 === 0,
    }));

    const { stdin, lastFrame, unmount } = render(
      <ReopenWorktreePopupApp
        resultFile="/tmp/dmux-reopen-worktree-result.json"
        projectName="repo-selected"
        worktrees={worktrees}
      />
    );

    await sleep(20);

    let output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('Please select a previously closed worktree to reopen.');
    expect(output).toContain('Worktree');
    expect(output).toContain('Last worked');
    expect(output).toContain('task-0');
    expect(output).not.toContain('task-9');
    expect(output).toContain('2 below');

    for (let count = 0; count < 8; count += 1) {
      await down(stdin);
    }

    output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('task-8');
    expect(output).toContain('task-9');
    expect(output).toContain('2 above');

    unmount();
  });
});
