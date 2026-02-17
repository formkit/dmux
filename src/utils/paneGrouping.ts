import type { DmuxPane } from '../types.js';
import { getPaneProjectName, getPaneProjectRoot } from './paneProject.js';

export interface GroupedPane {
  pane: DmuxPane;
  index: number;
}

export interface PaneProjectGroup {
  projectRoot: string;
  projectName: string;
  panes: GroupedPane[];
}

/**
 * Group panes by project while preserving the original pane ordering.
 */
export function groupPanesByProject(
  panes: DmuxPane[],
  fallbackProjectRoot: string,
  fallbackProjectName: string
): PaneProjectGroup[] {
  const groupMap = new Map<string, PaneProjectGroup>();
  const groups: PaneProjectGroup[] = [];

  panes.forEach((pane, index) => {
    const projectRoot = getPaneProjectRoot(pane, fallbackProjectRoot);
    let group = groupMap.get(projectRoot);

    if (!group) {
      group = {
        projectRoot,
        projectName: getPaneProjectName(pane, fallbackProjectRoot, fallbackProjectName),
        panes: [],
      };
      groupMap.set(projectRoot, group);
      groups.push(group);
    }

    group.panes.push({ pane, index });
  });

  return groups;
}
