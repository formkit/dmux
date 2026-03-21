import { createHash } from 'crypto';
import path from 'path';
import type { DmuxPane } from '../types.js';
import { getPaneProjectName, getPaneProjectRoot } from './paneProject.js';

export const PANE_TITLE_DELIMITER = '::dmux::';
export const TMUX_PANE_TITLE_DISPLAY_FORMAT = `#{s|${PANE_TITLE_DELIMITER}.*$||:pane_title}`;

function getProjectTag(projectRoot: string, projectName: string): string {
  const hash = createHash('md5')
    .update(projectRoot)
    .digest('hex')
    .slice(0, 4);
  const sanitizedName = projectName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${sanitizedName}-${hash}`;
}

export function sanitizePaneDisplayName(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replaceAll(PANE_TITLE_DELIMITER, ' ')
    .trim();
}

export function getPaneDisplayName(
  pane: Pick<DmuxPane, 'slug' | 'displayName'>
): string {
  const displayName = typeof pane.displayName === 'string'
    ? sanitizePaneDisplayName(pane.displayName)
    : '';
  return displayName || pane.slug;
}

function encodePaneTmuxTitle(displayTitle: string, stableTitle: string): string {
  if (displayTitle === stableTitle) {
    return stableTitle;
  }
  return `${displayTitle}${PANE_TITLE_DELIMITER}${stableTitle}`;
}

function getCustomPaneDisplayName(
  pane: Pick<DmuxPane, 'displayName'>
): string | undefined {
  if (typeof pane.displayName !== 'string') {
    return undefined;
  }

  const displayName = sanitizePaneDisplayName(pane.displayName);
  return displayName || undefined;
}

/**
 * Tmux pane title used for rebinding. Includes a stable project tag for
 * worktree panes so duplicate slugs across projects do not collide.
 */
export function getPaneTmuxTitle(
  pane: DmuxPane,
  fallbackProjectRoot?: string,
  fallbackProjectName?: string
): string {
  const displayTitle = getCustomPaneDisplayName(pane);

  if (pane.type === 'shell') {
    return displayTitle
      ? encodePaneTmuxTitle(displayTitle, pane.slug)
      : pane.slug;
  }

  const projectRoot = pane.projectRoot
    || (fallbackProjectRoot ? getPaneProjectRoot(pane, fallbackProjectRoot) : undefined);
  if (!projectRoot) {
    return displayTitle
      ? encodePaneTmuxTitle(displayTitle, pane.slug)
      : pane.slug;
  }

  if (
    fallbackProjectRoot
    && path.resolve(projectRoot) === path.resolve(fallbackProjectRoot)
  ) {
    // Keep the original title style for panes in the session's primary project.
    return displayTitle
      ? encodePaneTmuxTitle(displayTitle, pane.slug)
      : pane.slug;
  }

  const projectName = getPaneProjectName(pane, projectRoot, fallbackProjectName);
  const stableTitle = buildWorktreePaneTitle(pane.slug, projectRoot, projectName);
  return displayTitle
    ? encodePaneTmuxTitle(displayTitle, stableTitle)
    : stableTitle;
}

/**
 * Candidate titles to check when rebinding panes.
 * Includes legacy slug-only title for backward compatibility.
 */
export function getPaneTitleCandidates(
  pane: DmuxPane,
  fallbackProjectRoot?: string,
  fallbackProjectName?: string
): string[] {
  const nextTitle = getPaneTmuxTitle(pane, fallbackProjectRoot, fallbackProjectName);
  const fallbackCandidates = nextTitle.includes(PANE_TITLE_DELIMITER)
    ? [nextTitle.slice(nextTitle.indexOf(PANE_TITLE_DELIMITER) + PANE_TITLE_DELIMITER.length)]
    : [];

  return Array.from(new Set([nextTitle, ...fallbackCandidates, pane.slug]));
}

export function buildWorktreePaneTitle(
  slug: string,
  projectRoot: string,
  projectName?: string
): string {
  const name = projectName || 'project';
  return `${slug}@${getProjectTag(projectRoot, name)}`;
}
