import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Represents an orphaned worktree (exists on filesystem but no active pane)
 */
export interface OrphanedWorktree {
  slug: string;
  path: string;
  lastModified: Date;
  branch: string;
  hasUncommittedChanges: boolean;
}

/**
 * Gets a list of orphaned worktrees - worktrees that exist in .dmux/worktrees
 * but don't have an active pane tracking them
 */
export function getOrphanedWorktrees(
  projectRoot: string,
  activePaneSlugs: string[]
): OrphanedWorktree[] {
  const worktreesDir = path.join(projectRoot, '.dmux', 'worktrees');

  if (!fs.existsSync(worktreesDir)) {
    return [];
  }

  const orphaned: OrphanedWorktree[] = [];

  try {
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const slug = entry.name;
      const worktreePath = path.join(worktreesDir, slug);

      // Skip if this worktree has an active pane
      if (activePaneSlugs.includes(slug)) continue;

      // Check if it's a valid git worktree
      const gitFile = path.join(worktreePath, '.git');
      if (!fs.existsSync(gitFile)) continue;

      // Get last modified time (use most recent mtime from key files)
      let lastModified = new Date(0);
      try {
        const stats = fs.statSync(worktreePath);
        lastModified = stats.mtime;

        // Also check .git file modification time as a proxy for last activity
        const gitStats = fs.statSync(gitFile);
        if (gitStats.mtime > lastModified) {
          lastModified = gitStats.mtime;
        }
      } catch {
        // Use default date if stat fails
      }

      // Get the branch name
      let branch = slug; // Default to slug
      try {
        branch = execSync('git branch --show-current', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim() || slug;
      } catch {
        // Use slug as fallback
      }

      // Check for uncommitted changes
      const hasChanges = hasUncommittedChanges(worktreePath);

      orphaned.push({
        slug,
        path: worktreePath,
        lastModified,
        branch,
        hasUncommittedChanges: hasChanges,
      });
    }

    // Sort by most recently modified first
    orphaned.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  } catch {
    // Return empty array if directory read fails
  }

  return orphaned;
}