import { describe, expect, it } from 'vitest';
import {
  LEGACY_PANE_TITLE_DELIMITERS,
  PANE_TITLE_DELIMITER,
  buildWorktreePaneTitle,
  getPaneDisplayName,
  getPaneTitleCandidates,
  getPaneTmuxTitle,
} from '../src/utils/paneTitle.js';
import { createWorktreePane } from './fixtures/mockPanes.js';

describe('pane title helpers', () => {
  it('uses a tmux-safe delimiter for border title rendering', () => {
    expect(PANE_TITLE_DELIMITER.includes(':')).toBe(false);
  });

  it('prefers the custom display name for UI labels', () => {
    const pane = createWorktreePane({
      slug: 'fix-auth',
      displayName: 'Auth Review',
    });

    expect(getPaneDisplayName(pane)).toBe('Auth Review');
  });

  it('encodes a custom display name into the tmux title while preserving a stable suffix', () => {
    const pane = createWorktreePane({
      slug: 'fix-auth',
      displayName: 'Auth Review',
      projectRoot: '/tmp/project',
    });

    expect(getPaneTmuxTitle(pane, '/tmp/project')).toBe(
      `Auth Review${PANE_TITLE_DELIMITER}fix-auth`
    );
    expect(getPaneTitleCandidates(pane, '/tmp/project')).toContain('fix-auth');
    expect(getPaneTitleCandidates(pane, '/tmp/project')).toContain(
      `Auth Review${LEGACY_PANE_TITLE_DELIMITERS[0]}fix-auth`
    );
  });

  it('keeps the legacy multi-project title when no custom name is set', () => {
    const pane = createWorktreePane({
      slug: 'fix-auth',
      projectRoot: '/tmp/other-project',
      projectName: 'other-project',
    });

    expect(getPaneTmuxTitle(pane, '/tmp/session-project', 'session-project')).toBe(
      buildWorktreePaneTitle('fix-auth', '/tmp/other-project', 'other-project')
    );
  });
});
