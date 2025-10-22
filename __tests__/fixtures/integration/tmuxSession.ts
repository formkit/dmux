/**
 * Mock tmux session fixtures for integration tests
 */

export interface MockTmuxPaneInfo {
  paneId: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface MockTmuxSession {
  sessionName: string;
  windowId: string;
  panes: MockTmuxPaneInfo[];
}

/**
 * Create a mock tmux session with specified number of panes
 */
export function createMockTmuxSession(
  sessionName: string,
  numPanes: number = 1
): MockTmuxSession {
  const panes: MockTmuxPaneInfo[] = [];

  for (let i = 0; i < numPanes; i++) {
    panes.push({
      paneId: `%${i}`,
      title: i === 0 ? 'dmux-control' : `pane-${i}`,
      width: 80,
      height: 24,
      x: i * 80,
      y: 0,
    });
  }

  return {
    sessionName,
    windowId: '@0',
    panes,
  };
}

/**
 * Generate tmux command output for list-panes
 */
export function mockListPanesOutput(session: MockTmuxSession): string {
  return session.panes
    .map((pane) => `${pane.paneId}:${pane.title}:${pane.width}x${pane.height}`)
    .join('\n');
}

/**
 * Generate tmux command output for display-message -p
 */
export function mockDisplayMessageOutput(
  format: string,
  pane: MockTmuxPaneInfo
): string {
  const replacements: Record<string, string> = {
    '#{pane_id}': pane.paneId,
    '#{pane_title}': pane.title,
    '#{pane_width}': pane.width.toString(),
    '#{pane_height}': pane.height.toString(),
    '#{pane_left}': pane.x.toString(),
    '#{pane_top}': pane.y.toString(),
  };

  let output = format;
  for (const [pattern, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(pattern, 'g'), value);
  }

  return output;
}
