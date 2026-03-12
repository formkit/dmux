import { describe, it, expect } from 'vitest';
import { groupPanesByProject } from '../src/utils/paneGrouping.js';
import type { DmuxPane } from '../src/types.js';

function pane(id: string, slug: string, projectRoot?: string): DmuxPane {
  return {
    id,
    slug,
    prompt: `prompt-${slug}`,
    paneId: `%${id.replace('dmux-', '')}`,
    projectRoot,
  };
}

describe('groupPanesByProject', () => {
  it('groups panes by project while preserving pane order', () => {
    const panes: DmuxPane[] = [
      pane('dmux-1', 'a1', '/repo-a'),
      pane('dmux-2', 'a2', '/repo-a'),
      pane('dmux-3', 'b1', '/repo-b'),
      pane('dmux-4', 'a3', '/repo-a'),
    ];

    const groups = groupPanesByProject(panes, '/repo-main', 'repo-main');

    expect(groups).toHaveLength(3);
    expect(groups[0].projectRoot).toBe('/repo-main');
    expect(groups[0].panes).toHaveLength(0);

    expect(groups[1].projectRoot).toBe('/repo-a');
    expect(groups[1].panes.map((entry) => entry.pane.slug)).toEqual(['a1', 'a2', 'a3']);
    expect(groups[1].panes.map((entry) => entry.index)).toEqual([0, 1, 3]);

    expect(groups[2].projectRoot).toBe('/repo-b');
    expect(groups[2].panes.map((entry) => entry.pane.slug)).toEqual(['b1']);
    expect(groups[2].panes.map((entry) => entry.index)).toEqual([2]);
  });

  it('falls back to session project root for panes without metadata', () => {
    const panes: DmuxPane[] = [pane('dmux-1', 'main-pane')];

    const groups = groupPanesByProject(panes, '/repo-main', 'repo-main');
    expect(groups).toHaveLength(1);
    expect(groups[0].projectRoot).toBe('/repo-main');
    expect(groups[0].projectName).toBe('repo-main');
  });

  it('includes empty sidebar projects and keeps sidebar ordering stable', () => {
    const panes: DmuxPane[] = [
      pane('dmux-1', 'main-pane', '/repo-main'),
      pane('dmux-2', 'aux-pane', '/repo-aux'),
    ];

    const groups = groupPanesByProject(
      panes,
      '/repo-main',
      'repo-main',
      [
        { projectRoot: '/repo-main', projectName: 'repo-main' },
        { projectRoot: '/repo-empty', projectName: 'repo-empty' },
        { projectRoot: '/repo-aux', projectName: 'repo-aux' },
      ]
    );

    expect(groups.map((group) => group.projectRoot)).toEqual([
      '/repo-main',
      '/repo-empty',
      '/repo-aux',
    ]);
    expect(groups[1].panes).toHaveLength(0);
    expect(groups[2].panes.map((entry) => entry.pane.slug)).toEqual(['aux-pane']);
  });
});
