import { describe, expect, it } from 'vitest';
import type { DmuxPane, SidebarProject } from '../src/types.js';
import {
  buildProjectActionLayout,
  buildVisualNavigationRows,
} from '../src/utils/projectActions.js';

function pane(id: string, slug: string, projectRoot: string): DmuxPane {
  return {
    id,
    slug,
    prompt: `prompt-${slug}`,
    paneId: `%${id.replace('dmux-', '')}`,
    projectRoot,
  };
}

describe('projectActions', () => {
  it('adds remove-project only for empty non-root sidebar projects', () => {
    const panes: DmuxPane[] = [
      pane('dmux-1', 'main-pane', '/repo-main'),
      pane('dmux-2', 'aux-pane', '/repo-aux'),
    ];
    const sidebarProjects: SidebarProject[] = [
      { projectRoot: '/repo-main', projectName: 'repo-main' },
      { projectRoot: '/repo-empty', projectName: 'repo-empty' },
      { projectRoot: '/repo-aux', projectName: 'repo-aux' },
    ];

    const layout = buildProjectActionLayout(
      panes,
      sidebarProjects,
      '/repo-main',
      'repo-main'
    );

    expect(layout.multiProjectMode).toBe(true);
    expect(
      layout.actionItems
        .filter((action) => action.kind === 'remove-project')
        .map((action) => action.projectRoot)
    ).toEqual(['/repo-empty']);
  });

  it('adds action rows to navigation for empty projects', () => {
    const layout = buildProjectActionLayout(
      [],
      [
        { projectRoot: '/repo-main', projectName: 'repo-main' },
        { projectRoot: '/repo-empty', projectName: 'repo-empty' },
      ],
      '/repo-main',
      'repo-main'
    );

    expect(buildVisualNavigationRows(layout)).toEqual([
      [0, 1],
      [2, 3, 4],
    ]);
  });
});
