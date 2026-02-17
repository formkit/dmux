import { createHash } from 'crypto';
import path from 'path';
import type { DmuxPane } from '../types.js';
import { getPaneProjectName, getPaneProjectRoot } from './paneProject.js';

function getProjectTag(projectRoot: string, projectName: string): string {
  const hash = createHash('md5')
    .update(projectRoot)
    .digest('hex')
    .slice(0, 4);
  const sanitizedName = projectName.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `${sanitizedName}-${hash}`;
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
  if (pane.type === 'shell') {
    return pane.slug;
  }

  const projectRoot = pane.projectRoot
    || (fallbackProjectRoot ? getPaneProjectRoot(pane, fallbackProjectRoot) : undefined);
  if (!projectRoot) {
    return pane.slug;
  }

  if (
    fallbackProjectRoot
    && path.resolve(projectRoot) === path.resolve(fallbackProjectRoot)
  ) {
    // Keep the original title style for panes in the session's primary project.
    return pane.slug;
  }

  const projectName = getPaneProjectName(pane, projectRoot, fallbackProjectName);
  return buildWorktreePaneTitle(pane.slug, projectRoot, projectName);
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
  if (nextTitle === pane.slug) {
    return [pane.slug];
  }
  return [nextTitle, pane.slug];
}

export function buildWorktreePaneTitle(
  slug: string,
  projectRoot: string,
  projectName?: string
): string {
  const name = projectName || 'project';
  return `${slug}@${getProjectTag(projectRoot, name)}`;
}
