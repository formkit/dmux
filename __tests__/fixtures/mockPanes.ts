/**
 * Mock DmuxPane fixtures for testing
 */

import type { DmuxPane } from '../../src/types.js';

export function createMockPane(overrides?: Partial<DmuxPane>): DmuxPane {
  return {
    id: 'dmux-1',
    slug: 'test-pane',
    prompt: 'test prompt',
    paneId: '%42',
    worktreePath: '/test/worktree/path',
    agent: 'claude',
    type: 'worktree',
    autopilot: false,
    ...overrides,
  };
}

export function createShellPane(overrides?: Partial<DmuxPane>): DmuxPane {
  return createMockPane({
    type: 'shell',
    worktreePath: undefined,
    ...overrides,
  });
}

export function createWorktreePane(overrides?: Partial<DmuxPane>): DmuxPane {
  return createMockPane({
    type: 'worktree',
    worktreePath: '/test/project/.dmux/worktrees/test-pane',
    ...overrides,
  });
}

export function createMultiplePanes(count: number): DmuxPane[] {
  return Array.from({ length: count }, (_, i) => createMockPane({
    id: `dmux-${i + 1}`,
    slug: `test-pane-${i + 1}`,
    paneId: `%${40 + i}`,
  }));
}
