import { describe, expect, it } from 'vitest';
import type { DmuxPane } from '../src/types.js';
import {
  getBulkVisibilityAction,
  getVisiblePanes,
  syncHiddenStateFromCurrentWindow,
} from '../src/utils/paneVisibility.js';

function pane(id: string, hidden = false): DmuxPane {
  return {
    id,
    slug: `pane-${id}`,
    prompt: `prompt-${id}`,
    paneId: `%${id.replace('dmux-', '')}`,
    hidden,
  };
}

describe('paneVisibility', () => {
  it('syncs hidden flags from the active window pane list', () => {
    const panes = [
      pane('dmux-1', true),
      pane('dmux-2', false),
      pane('dmux-3', false),
    ];

    const synced = syncHiddenStateFromCurrentWindow(panes, ['%2']);

    expect(synced.map((entry) => entry.hidden)).toEqual([true, false, true]);
  });

  it('preserves hidden flags when no current window pane list is available', () => {
    const panes = [
      pane('dmux-1', true),
      pane('dmux-2', false),
    ];

    const synced = syncHiddenStateFromCurrentWindow(panes, []);

    expect(synced).toEqual(panes);
  });

  it('chooses hide-others when any other pane is visible', () => {
    const panes = [
      pane('dmux-1', false),
      pane('dmux-2', false),
      pane('dmux-3', true),
    ];

    expect(getBulkVisibilityAction(panes, panes[0])).toBe('hide-others');
  });

  it('chooses show-others when all other panes are hidden', () => {
    const panes = [
      pane('dmux-1', false),
      pane('dmux-2', true),
      pane('dmux-3', true),
    ];

    expect(getBulkVisibilityAction(panes, panes[0])).toBe('show-others');
  });

  it('returns only visible panes', () => {
    const panes = [
      pane('dmux-1', false),
      pane('dmux-2', true),
      pane('dmux-3', false),
    ];

    expect(getVisiblePanes(panes).map((entry) => entry.id)).toEqual([
      'dmux-1',
      'dmux-3',
    ]);
  });
});
