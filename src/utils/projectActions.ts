import path from 'path';
import type { DmuxPane } from '../types.js';
import {
  groupPanesByProject,
  type PaneProjectGroup,
} from './paneGrouping.js';

export type ProjectActionKind = 'new-agent' | 'terminal';

export interface ProjectActionItem {
  index: number;
  projectRoot: string;
  projectName: string;
  kind: ProjectActionKind;
  hotkey: 'n' | 't' | null;
}

export interface ProjectActionLayout {
  groups: PaneProjectGroup[];
  actionItems: ProjectActionItem[];
  totalItems: number;
  multiProjectMode: boolean;
}

function sameRoot(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

/**
 * Build action-card metadata for pane navigation and rendering.
 *
 * - Single-project mode (<2 groups): one shared pair of action cards
 * - Multi-project mode (>=2 groups): one pair of cards under each project group
 */
export function buildProjectActionLayout(
  panes: DmuxPane[],
  fallbackProjectRoot: string,
  fallbackProjectName: string
): ProjectActionLayout {
  const groups = groupPanesByProject(panes, fallbackProjectRoot, fallbackProjectName);
  const multiProjectMode = groups.length >= 2;
  const actionItems: ProjectActionItem[] = [];

  if (!multiProjectMode) {
    const baseIndex = panes.length;
    actionItems.push({
      index: baseIndex,
      projectRoot: fallbackProjectRoot,
      projectName: fallbackProjectName,
      kind: 'new-agent',
      hotkey: 'n',
    });
    actionItems.push({
      index: baseIndex + 1,
      projectRoot: fallbackProjectRoot,
      projectName: fallbackProjectName,
      kind: 'terminal',
      hotkey: 't',
    });
  } else {
    let index = panes.length;
    for (const group of groups) {
      const isMainProject = sameRoot(group.projectRoot, fallbackProjectRoot);
      actionItems.push({
        index,
        projectRoot: group.projectRoot,
        projectName: group.projectName,
        kind: 'new-agent',
        hotkey: isMainProject ? 'n' : null,
      });
      index += 1;
      actionItems.push({
        index,
        projectRoot: group.projectRoot,
        projectName: group.projectName,
        kind: 'terminal',
        hotkey: isMainProject ? 't' : null,
      });
      index += 1;
    }
  }

  return {
    groups,
    actionItems,
    totalItems: panes.length + actionItems.length,
    multiProjectMode,
  };
}

export function getProjectActionByIndex(
  actionItems: ProjectActionItem[],
  index: number
): ProjectActionItem | undefined {
  return actionItems.find((item) => item.index === index);
}
