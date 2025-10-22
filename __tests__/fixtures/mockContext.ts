/**
 * Mock ActionContext for testing
 */

import type { DmuxPane } from '../../src/types.js';
import type { ActionContext } from '../../src/actions/types.js';

export function createMockContext(
  panes: DmuxPane[] = [],
  overrides?: Partial<ActionContext>
): ActionContext {
  return {
    panes,
    sessionName: 'test-session',
    projectName: 'test-project',
    savePanes: async (newPanes: DmuxPane[]) => {
      // Mock implementation - in real tests, you can spy on this
      panes.splice(0, panes.length, ...newPanes);
    },
    onPaneUpdate: undefined,
    onPaneRemove: undefined,
    forceRepaint: undefined,
    ...overrides,
  };
}
