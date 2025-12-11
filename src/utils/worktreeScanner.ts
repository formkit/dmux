/**
 * Worktree Scanner - Scans filesystem for orphaned worktrees
 *
 * Orphaned worktrees are worktree directories that exist on the filesystem
 * (in .dmux/worktrees/) but are not tracked in the dmux config. This can happen
 * when dmux is restarted or crashes without proper cleanup.
 *
 * This scanner finds these orphaned worktrees and creates pane entries for them
 * so they can be managed (reopened or cleaned up) through the dmux UI.
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';
import { LogService } from '../services/LogService.js';

interface OrphanedWorktree {
  slug: string;
  worktreePath: string;
  branchName?: string;
}

/**
 * Scans the .dmux/worktrees directory for orphaned worktrees
 * Returns worktrees that exist on filesystem but are not in the provided panes list
 */
export async function scanForOrphanedWorktrees(
  projectRoot: string,
  existingPanes: DmuxPane[]
): Promise<OrphanedWorktree[]> {
  const worktreesDir = path.join(projectRoot, '.dmux', 'worktrees');
  const orphaned: OrphanedWorktree[] = [];

  // Get slugs of all existing tracked panes with worktrees
  const trackedSlugs = new Set(
    existingPanes
      .filter(p => p.worktreePath)
      .map(p => p.slug)
  );

  try {
    // Check if worktrees directory exists
    const dirExists = await fs.stat(worktreesDir).then(() => true).catch(() => false);
    if (!dirExists) {
      return [];
    }

    // List all directories in worktrees folder
    const entries = await fs.readdir(worktreesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const slug = entry.name;
      const worktreePath = path.join(worktreesDir, slug);

      // Skip if already tracked
      if (trackedSlugs.has(slug)) continue;

      // Verify it's a valid git worktree (has .git file)
      const gitFile = path.join(worktreePath, '.git');
      const isWorktree = await fs.stat(gitFile).then(() => true).catch(() => false);

      if (!isWorktree) {
        LogService.getInstance().debug(
          `Skipping non-worktree directory: ${slug}`,
          'worktreeScanner'
        );
        continue;
      }

      // Try to get the branch name
      let branchName: string | undefined;
      try {
        branchName = execSync('git branch --show-current', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        // Branch might not exist or be detached, that's okay
        branchName = slug;
      }

      orphaned.push({
        slug,
        worktreePath,
        branchName,
      });

      LogService.getInstance().debug(
        `Found orphaned worktree: ${slug} at ${worktreePath}`,
        'worktreeScanner'
      );
    }

    if (orphaned.length > 0) {
      LogService.getInstance().info(
        `Found ${orphaned.length} orphaned worktree(s) on filesystem`,
        'worktreeScanner'
      );
    }

    return orphaned;
  } catch (error) {
    LogService.getInstance().debug(
      `Error scanning for orphaned worktrees: ${error instanceof Error ? error.message : String(error)}`,
      'worktreeScanner'
    );
    return [];
  }
}

/**
 * Creates DmuxPane objects for orphaned worktrees
 * These panes won't have tmux pane IDs until they're opened
 */
export function createPanesForOrphanedWorktrees(
  orphanedWorktrees: OrphanedWorktree[],
  startingId: number
): DmuxPane[] {
  return orphanedWorktrees.map((worktree, index) => ({
    id: `dmux-${startingId + index}`,
    slug: worktree.slug,
    prompt: '', // Unknown prompt for orphaned worktree
    paneId: '', // No tmux pane yet
    worktreePath: worktree.worktreePath,
    type: 'worktree' as const,
    orphaned: true, // Mark as orphaned so UI can indicate this
  }));
}

/**
 * Gets the next available dmux ID number
 */
export function getNextDmuxIdNumber(existingPanes: DmuxPane[]): number {
  let maxId = 0;
  for (const pane of existingPanes) {
    const match = pane.id.match(/^dmux-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) maxId = num;
    }
  }
  return maxId + 1;
}
