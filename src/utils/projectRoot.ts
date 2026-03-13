import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import path from 'path';

export interface ResolvedProjectRoot {
  projectRoot: string;
  projectName: string;
  requestedPath: string;
}

export type ProjectCreationTargetState =
  | 'missing'
  | 'empty_directory'
  | 'directory_not_empty'
  | 'file';

export interface ProjectCreationTarget {
  requestedPath: string;
  absolutePath: string;
  state: ProjectCreationTargetState;
}

function expandHomePath(inputPath: string): string {
  if (!inputPath.startsWith('~')) return inputPath;
  const home = process.env.HOME;
  if (!home) return inputPath;
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return path.join(home, inputPath.slice(2));
  return inputPath;
}

function resolveProjectPathInput(
  rawPath: string,
  baseDir: string = process.cwd()
): { requestedPath: string; absolutePath: string } {
  const requestedPath = rawPath.trim();
  if (!requestedPath) {
    throw new Error('Project path is required');
  }

  const expanded = expandHomePath(requestedPath);
  return {
    requestedPath,
    absolutePath: path.resolve(baseDir, expanded),
  };
}

export function inspectProjectCreationTarget(
  rawPath: string,
  baseDir: string = process.cwd()
): ProjectCreationTarget {
  const { requestedPath, absolutePath } = resolveProjectPathInput(rawPath, baseDir);

  if (!existsSync(absolutePath)) {
    return {
      requestedPath,
      absolutePath,
      state: 'missing',
    };
  }

  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    return {
      requestedPath,
      absolutePath,
      state: 'file',
    };
  }

  const entries = readdirSync(absolutePath);
  return {
    requestedPath,
    absolutePath,
    state: entries.length === 0 ? 'empty_directory' : 'directory_not_empty',
  };
}

/**
 * Resolve any path inside a git repo/worktree to the main repository root.
 */
export function resolveProjectRootFromPath(
  rawPath: string,
  baseDir: string = process.cwd()
): ResolvedProjectRoot {
  const { requestedPath, absolutePath } = resolveProjectPathInput(rawPath, baseDir);

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

export function createEmptyGitProject(
  rawPath: string,
  baseDir: string = process.cwd()
): ResolvedProjectRoot {
  const target = inspectProjectCreationTarget(rawPath, baseDir);

  if (target.state === 'file') {
    throw new Error(`Path is not a directory: ${target.absolutePath}`);
  }

  if (target.state === 'directory_not_empty') {
    throw new Error(
      `Directory is not empty: ${target.absolutePath}. New projects can only be created in an empty directory.`
    );
  }

  let createdDirectory = false;
  if (target.state === 'missing') {
    mkdirSync(target.absolutePath, { recursive: true });
    createdDirectory = true;
  }

  try {
    execSync('git init', {
      cwd: target.absolutePath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch {
    if (createdDirectory) {
      try {
        rmSync(target.absolutePath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }

    throw new Error(`Failed to initialize git repository: ${target.absolutePath}`);
  }

  return {
    projectRoot: target.absolutePath,
    projectName: path.basename(target.absolutePath) || 'project',
    requestedPath: target.requestedPath,
  };
}
