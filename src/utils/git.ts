import { execSync } from 'child_process';

/**
 * Detects the main/master branch name for the repository
 */
export function getMainBranch(): string {
  try {
    // First try to get the default branch from origin
    const originHead = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null', {
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (originHead) {
      // Extract branch name from refs/remotes/origin/main format
      const match = originHead.match(/refs\/remotes\/origin\/(.+)/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // Fallback if origin/HEAD is not set
  }

  try {
    // Check if 'main' branch exists
    execSync('git show-ref --verify --quiet refs/heads/main', { stdio: 'pipe' });
    return 'main';
  } catch {
    // main doesn't exist
  }

  try {
    // Check if 'master' branch exists
    execSync('git show-ref --verify --quiet refs/heads/master', { stdio: 'pipe' });
    return 'master';
  } catch {
    // master doesn't exist
  }

  // Last resort: get the initial branch
  try {
    const branches = execSync('git branch --list', { encoding: 'utf8', stdio: 'pipe' });
    const match = branches.match(/^\* (.+)$/m);
    if (match) {
      return match[1].trim();
    }
  } catch {
    // Failed to get any branch
  }

  return 'main'; // Default fallback
}

/**
 * Gets the current branch name
 */
export function getCurrentBranch(cwd?: string): string {
  try {
    return execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Checks if there are uncommitted changes in the repository
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Gets the list of conflicted files
 */
export function getConflictedFiles(cwd?: string): string[] {
  try {
    const status = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    return status
      .split('\n')
      .filter(line => line.startsWith('UU ') || line.startsWith('AA '))
      .map(line => line.substring(3).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}