import { describe, expect, it } from 'vitest';
import { shouldMonitorPaneForStatusTracking } from '../src/services/PaneWorkerManager.js';

describe('pane status monitoring eligibility', () => {
  it('monitors worktree panes with an attached agent', () => {
    expect(
      shouldMonitorPaneForStatusTracking({
        type: 'worktree',
        agent: 'claude',
      })
    ).toBe(true);
  });

  it('does not monitor shell panes', () => {
    expect(
      shouldMonitorPaneForStatusTracking({
        type: 'shell',
        agent: undefined,
      })
    ).toBe(false);
  });

  it('does not monitor worktree panes without an attached agent', () => {
    expect(
      shouldMonitorPaneForStatusTracking({
        type: 'worktree',
        agent: undefined,
      })
    ).toBe(false);
  });
});
