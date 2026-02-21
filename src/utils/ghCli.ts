import { execSync } from 'child_process';
import { LogService } from '../services/LogService.js';

/**
 * Check if gh CLI is installed
 */
export async function isGhAvailable(): Promise<boolean> {
  try {
    execSync('gh --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gh CLI is authenticated
 */
export async function isGhAuthenticated(): Promise<boolean> {
  try {
    execSync('gh auth status', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Push a branch to the remote
 */
export async function pushBranch(cwd: string, branch: string): Promise<{ success: boolean; error?: string }> {
  try {
    execSync(`git push -u origin "${branch}"`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * Create a pull request
 */
export async function createPr(options: {
  cwd: string;
  title: string;
  body: string;
  base?: string;
  head?: string;
  draft?: boolean;
}): Promise<{ success: boolean; prNumber?: number; prUrl?: string; error?: string }> {
  const { cwd, title, body, base, head, draft } = options;
  const logger = LogService.getInstance();

  try {
    const draftFlag = draft ? ' --draft' : '';
    const baseFlag = base ? ` --base "${base}"` : '';
    const headFlag = head ? ` --head "${head}"` : '';

    // Write body to temp file to avoid shell escaping issues
    const { writeFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const path = await import('path');
    const tmpFile = path.join(tmpdir(), `dmux-pr-body-${Date.now()}.md`);
    writeFileSync(tmpFile, body, 'utf-8');

    try {
      const result = execSync(
        `gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${tmpFile}"${baseFlag}${headFlag}${draftFlag}`,
        { cwd, encoding: 'utf-8', stdio: 'pipe' }
      );

      // gh pr create outputs the PR URL
      const prUrl = result.trim();
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

      logger.info(`PR created: ${prUrl}`, 'ghCli');
      return { success: true, prNumber, prUrl };
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  } catch (error: any) {
    const errorMsg = error.stderr || error.message;
    logger.error(`Failed to create PR: ${errorMsg}`, 'ghCli');
    return { success: false, error: errorMsg };
  }
}

export interface PrStatusInfo {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  title: string;
}

/**
 * Get PR status
 */
export async function getPrStatus(cwd: string, prNumber: number): Promise<PrStatusInfo | null> {
  try {
    const result = execSync(
      `gh pr view ${prNumber} --json state,isDraft,title`,
      { cwd, encoding: 'utf-8', stdio: 'pipe' }
    );
    return JSON.parse(result.trim());
  } catch {
    return null;
  }
}

export interface PrChecksInfo {
  overall: 'pending' | 'success' | 'failure';
  checks: Array<{ name: string; status: string; conclusion: string; url?: string }>;
}

/**
 * Get PR CI check status
 */
export async function getPrChecks(cwd: string, prNumber: number): Promise<PrChecksInfo | null> {
  try {
    const result = execSync(
      `gh pr checks ${prNumber} --json name,state,conclusion,detailsUrl`,
      { cwd, encoding: 'utf-8', stdio: 'pipe' }
    );

    const checks = JSON.parse(result.trim()) as Array<{
      name: string;
      state: string;
      conclusion: string;
      detailsUrl?: string;
    }>;

    // Determine overall status
    let overall: 'pending' | 'success' | 'failure' = 'success';
    for (const check of checks) {
      if (check.state === 'PENDING' || check.state === 'QUEUED' || check.state === 'IN_PROGRESS') {
        overall = 'pending';
        break;
      }
      if (check.conclusion === 'FAILURE' || check.conclusion === 'CANCELLED' || check.conclusion === 'TIMED_OUT') {
        overall = 'failure';
      }
    }

    return {
      overall,
      checks: checks.map(c => ({
        name: c.name,
        status: c.state,
        conclusion: c.conclusion,
        url: c.detailsUrl,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Get existing PR for a branch
 */
export async function getExistingPr(cwd: string, branch: string): Promise<{ prNumber: number; prUrl: string } | null> {
  try {
    const result = execSync(
      `gh pr view "${branch}" --json number,url`,
      { cwd, encoding: 'utf-8', stdio: 'pipe' }
    );
    const data = JSON.parse(result.trim());
    return { prNumber: data.number, prUrl: data.url };
  } catch {
    return null;
  }
}
