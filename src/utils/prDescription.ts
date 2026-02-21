import { callAgent } from './agentHarness.js';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { LogService } from '../services/LogService.js';

/**
 * Generate a PR title and body using an AI agent
 */
export async function generatePrDescription(options: {
  panePrompt: string;
  branch: string;
  cwd: string;
  projectRoot: string;
}): Promise<{ title: string; body: string }> {
  const { panePrompt, branch, cwd, projectRoot } = options;
  const logger = LogService.getInstance();
  const fallbackTitle = `${branch}`;
  const fallbackBody = `## Summary\n\n${panePrompt}\n`;

  try {
    // Get diff summary (file stats)
    let diffSummary = '';
    try {
      diffSummary = execSync(`git diff main...${branch} --stat`, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      // Branch may not exist on main yet
      try {
        diffSummary = execSync('git diff --stat', {
          cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
      } catch {}
    }

    // Get commit messages for the branch
    let commitLog = '';
    try {
      commitLog = execSync(`git log main..${branch} --pretty=format:"%h %s"`, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      // Branch may not have diverged from main yet
    }

    // Get actual diff content (truncated for large diffs)
    const MAX_DIFF_CHARS = 8000;
    let diffContent = '';
    try {
      const rawDiff = execSync(`git diff main...${branch}`, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      diffContent = rawDiff.length > MAX_DIFF_CHARS
        ? rawDiff.slice(0, MAX_DIFF_CHARS) + '\n...(truncated)'
        : rawDiff;
    } catch {
      try {
        const rawDiff = execSync('git diff', {
          cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        diffContent = rawDiff.length > MAX_DIFF_CHARS
          ? rawDiff.slice(0, MAX_DIFF_CHARS) + '\n...(truncated)'
          : rawDiff;
      } catch {}
    }

    // Check for PR template
    let prTemplate = '';
    const templatePaths = [
      path.join(projectRoot, '.dmux', 'templates', 'pr-template.md'),
      path.join(projectRoot, '.github', 'pull_request_template.md'),
      path.join(projectRoot, '.github', 'PULL_REQUEST_TEMPLATE.md'),
    ];
    for (const tpl of templatePaths) {
      if (existsSync(tpl)) {
        prTemplate = readFileSync(tpl, 'utf-8');
        break;
      }
    }

    const prompt = `Generate a pull request title and body for the following changes.

Original task prompt: "${panePrompt}"
Branch: ${branch}

${commitLog ? `Commits:\n${commitLog}\n` : ''}
Files changed:
${diffSummary || '(no diff available)'}

${diffContent ? `Diff:\n${diffContent}\n` : ''}
${prTemplate ? `Use this PR template as a guide:\n${prTemplate}\n` : ''}

Respond with ONLY valid JSON in this format:
{"title": "short PR title (under 70 chars)", "body": "markdown PR body with ## Summary section"}`;

    // Use sonnet for large diffs (>3000 chars), haiku for small ones
    const model = diffContent.length > 3000 ? 'mid' as const : 'cheap' as const;
    const response = await callAgent(prompt, { json: true, timeout: 45000, model });

    if (response) {
      try {
        const parsed = JSON.parse(response);
        if (parsed.title && parsed.body) {
          return { title: parsed.title, body: parsed.body };
        }
      } catch {
        logger.debug('Failed to parse PR description JSON', 'prDescription');
      }
    }
  } catch (error) {
    logger.debug(`PR description generation failed: ${error}`, 'prDescription');
  }

  return { title: fallbackTitle, body: fallbackBody };
}
