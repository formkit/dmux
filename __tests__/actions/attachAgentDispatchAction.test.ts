import { describe, expect, it, vi } from 'vitest';
import { executeAction, PaneAction } from '../../src/actions/index.js';
import type { ActionContext } from '../../src/actions/types.js';
import type { DmuxPane } from '../../src/types.js';

const pane: DmuxPane = {
  id: 'pane-1',
  slug: 'feature-1',
  prompt: 'test prompt',
  paneId: '%1',
  worktreePath: '/tmp/repo/.dmux/worktrees/feature-1',
};

const context: ActionContext = {
  panes: [pane],
  sessionName: 'session',
  projectName: 'project',
  savePanes: vi.fn(async () => {}),
};

describe('attach_agent dispatcher', () => {
  it('does not return unknown action for attach_agent', async () => {
    const result = await executeAction(PaneAction.ATTACH_AGENT, pane, context);

    expect(result.type).toBe('info');
    expect(result.message).toContain('Attach agent');
  });
});
