import type { DmuxPane } from "../types.js";

export type PaneBulkVisibilityAction = "hide-others" | "show-others";

export function getVisiblePanes(panes: DmuxPane[]): DmuxPane[] {
  return panes.filter((pane) => !pane.hidden);
}

export function syncHiddenStateFromCurrentWindow(
  panes: DmuxPane[],
  currentWindowPaneIds: string[]
): DmuxPane[] {
  if (currentWindowPaneIds.length === 0) {
    return panes;
  }

  return panes.map((pane) => {
    const hidden = !currentWindowPaneIds.includes(pane.paneId);
    return pane.hidden === hidden ? pane : { ...pane, hidden };
  });
}

export function getBulkVisibilityAction(
  panes: DmuxPane[],
  selectedPane: DmuxPane
): PaneBulkVisibilityAction | null {
  const otherPanes = panes.filter((pane) => pane.id !== selectedPane.id);
  if (otherPanes.length === 0) {
    return null;
  }

  if (otherPanes.some((pane) => !pane.hidden)) {
    return "hide-others";
  }

  if (otherPanes.some((pane) => pane.hidden)) {
    return "show-others";
  }

  return null;
}
