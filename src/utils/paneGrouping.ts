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
 * Sort panes so that attached agents (-a2, -a3, etc.) appear
 * immediately after their source pane.
 */
function sortWithAttachedAgents(panes: GroupedPane[]): GroupedPane[] {
  const result: GroupedPane[] = [];
  const used = new Set<number>();

  for (let i = 0; i < panes.length; i++) {
    if (used.has(i)) continue;
    result.push(panes[i]);
    used.add(i);

    // Find attached agents for this pane's slug
    const baseSlug = panes[i].pane.slug;
    for (let j = 0; j < panes.length; j++) {
      if (used.has(j)) continue;
      const slug = panes[j].pane.slug;
      if (slug.startsWith(baseSlug + '-a') && /^-a\d+$/.test(slug.slice(baseSlug.length))) {
        result.push(panes[j]);
        used.add(j);
      }
    }
  }

  return result;
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

  // Sort within each group so attached agents follow their source pane
  for (const group of groups) {
    group.panes = sortWithAttachedAgents(group.panes);
  }

  return groups;
}
