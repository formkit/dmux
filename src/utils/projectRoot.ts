import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import path from 'path';

export interface ResolvedProjectRoot {
  projectRoot: string;
  projectName: string;
  requestedPath: string;
}

function expandHomePath(inputPath: string): string {
  if (!inputPath.startsWith('~')) return inputPath;
  const home = process.env.HOME;
  if (!home) return inputPath;
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return path.join(home, inputPath.slice(2));
  return inputPath;
}

/**
 * Resolve any path inside a git repo/worktree to the main repository root.
 */
export function resolveProjectRootFromPath(
  rawPath: string,
  baseDir: string = process.cwd()
): ResolvedProjectRoot {
  const requestedPath = rawPath.trim();
  if (!requestedPath) {
    throw new Error('Project path is required');
  }

  const expanded = expandHomePath(requestedPath);
  const absolutePath = path.resolve(baseDir, expanded);

  if (!existsSync(absolutePath)) {
    throw new Error(`Path does not exist: ${absolutePath}`);
  }

  const stat = statSync(absolutePath);
  const workingDir = stat.isDirectory() ? absolutePath : path.dirname(absolutePath);

  let gitCommonDir: string;
  try {
    gitCommonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: workingDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    try {
      const fallbackRoot = execSync('git rev-parse --show-toplevel', {
        cwd: workingDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      return {
        projectRoot: fallbackRoot,
        projectName: path.basename(fallbackRoot),
        requestedPath,
      };
    } catch {
      throw new Error(`Not a git repository: ${absolutePath}`);
    }
  }

  if (!gitCommonDir) {
    throw new Error(`Unable to determine git root for: ${absolutePath}`);
  }

  const projectRoot = path.dirname(gitCommonDir);
  return {
    projectRoot,
    projectName: path.basename(projectRoot),
    requestedPath,
  };
}
