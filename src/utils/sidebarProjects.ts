import path from 'path';
import type { DmuxPane, SidebarProject } from '../types.js';
import { getPaneProjectName, getPaneProjectRoot } from './paneProject.js';

function normalizeProjectRoot(projectRoot: string): string {
  return path.resolve(projectRoot);
}

function buildProjectEntry(projectRoot: string, projectName?: string): SidebarProject {
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const derivedName = path.basename(normalizedRoot) || 'project';

  return {
    projectRoot: normalizedRoot,
    projectName: projectName?.trim() || derivedName,
  };
}

export function sameSidebarProjectRoot(a: string, b: string): boolean {
  return normalizeProjectRoot(a) === normalizeProjectRoot(b);
}

export function hasSidebarProject(
  projects: SidebarProject[],
  projectRoot: string
): boolean {
  return projects.some((project) => sameSidebarProjectRoot(project.projectRoot, projectRoot));
}

export function addSidebarProject(
  projects: SidebarProject[],
  project: SidebarProject
): SidebarProject[] {
  if (hasSidebarProject(projects, project.projectRoot)) {
    return projects;
  }

  return [...projects, buildProjectEntry(project.projectRoot, project.projectName)];
}

export function removeSidebarProject(
  projects: SidebarProject[],
  projectRoot: string
): SidebarProject[] {
  return projects.filter((project) => !sameSidebarProjectRoot(project.projectRoot, projectRoot));
}

/**
 * Normalize persistent sidebar projects so the session project is always present,
 * explicit sidebar entries keep their order, and any pane-backed projects are
 * preserved for backward compatibility.
 */
export function normalizeSidebarProjects(
  sidebarProjects: SidebarProject[] | undefined,
  panes: DmuxPane[],
  fallbackProjectRoot: string,
  fallbackProjectName: string
): SidebarProject[] {
  const normalizedProjects: SidebarProject[] = [];
  const seenRoots = new Set<string>();

  const addProject = (projectRoot: string, projectName?: string) => {
    const entry = buildProjectEntry(projectRoot, projectName);
    const key = normalizeProjectRoot(entry.projectRoot);
    if (seenRoots.has(key)) {
      return;
    }

    seenRoots.add(key);
    normalizedProjects.push(entry);
  };

  addProject(fallbackProjectRoot, fallbackProjectName);

  for (const project of sidebarProjects || []) {
    if (!project?.projectRoot) continue;
    addProject(project.projectRoot, project.projectName);
  }

  for (const pane of panes) {
    const projectRoot = getPaneProjectRoot(pane, fallbackProjectRoot);
    const projectName = getPaneProjectName(pane, fallbackProjectRoot, fallbackProjectName);
    addProject(projectRoot, projectName);
  }

  return normalizedProjects;
}
