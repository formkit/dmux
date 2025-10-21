/**
 * Conflict Resolution Pane Creation
 *
 * Utilities for creating a new pane specifically for AI-assisted merge conflict resolution
 */

import { execSync } from 'child_process';
import type { DmuxPane } from '../types.js';
import { enforceControlPaneSize } from './tmux.js';
import { capturePaneContent } from './paneCapture.js';
import { SIDEBAR_WIDTH } from './layoutManager.js';

export interface ConflictResolutionPaneOptions {
  sourceBranch: string;      // Branch being merged (the worktree branch)
  targetBranch: string;      // Branch merging into (usually main)
  targetRepoPath: string;    // Path to the target repository (where merge will happen)
  agent: 'claude' | 'opencode';
  projectName: string;
  existingPanes: DmuxPane[];
}

/**
 * Create a pane for resolving merge conflicts with AI assistance
 */
export async function createConflictResolutionPane(
  options: ConflictResolutionPaneOptions
): Promise<DmuxPane> {
  const { sourceBranch, targetBranch, targetRepoPath, agent, projectName, existingPanes } = options;

  // Generate slug for this conflict resolution session
  const slug = `merge-${sourceBranch}-into-${targetBranch}`.substring(0, 50);

  // Get current pane info
  const originalPaneId = execSync('tmux display-message -p "#{pane_id}"', {
    encoding: 'utf-8',
  }).trim();

  // Get current pane count
  const paneCount = parseInt(
    execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim()
  );

  // Enable pane borders to show titles
  try {
    execSync(`tmux set-option -g pane-border-status top`, { stdio: 'pipe' });
  } catch {
    // Ignore if already set or fails
  }

  // Create new pane
  const paneInfo = execSync(`tmux split-window -h -P -F '#{pane_id}'`, {
    encoding: 'utf-8',
  }).trim();

  // Wait for pane creation to settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Set pane title
  try {
    execSync(`tmux select-pane -t '${paneInfo}' -T "${slug}"`, {
      stdio: 'pipe',
    });
  } catch {
    // Ignore if setting title fails
  }

  // Don't apply global layouts - just enforce sidebar width
  try {
    const controlPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
    enforceControlPaneSize(controlPaneId, SIDEBAR_WIDTH);
  } catch {}

  // CD into the target repository (where we'll resolve conflicts)
  try {
    execSync(`tmux send-keys -t '${paneInfo}' 'cd "${targetRepoPath}"' Enter`, {
      stdio: 'pipe',
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error('[conflictResolutionPane] Failed to cd into target repo:', error);
  }

  // CRITICAL: Ensure clean state before starting merge
  // If a previous merge attempt left MERGE_HEAD, abort it first
  try {
    execSync(`tmux send-keys -t '${paneInfo}' 'git merge --abort 2>/dev/null || true' Enter`, {
      stdio: 'pipe',
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error('[conflictResolutionPane] Failed to abort previous merge:', error);
  }

  // CRITICAL: Start the merge to create conflict markers for the agent to resolve
  // This is necessary because pre-validation or failed execution may have aborted the merge
  try {
    execSync(`tmux send-keys -t '${paneInfo}' 'git merge ${targetBranch} --no-edit || true' Enter`, {
      stdio: 'pipe',
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error('[conflictResolutionPane] Failed to initiate merge:', error);
  }

  // Construct the AI prompt for conflict resolution
  const prompt = `There are conflicts merging ${targetBranch} into ${sourceBranch}. Both are valid changes, so please keep both feature sets and merge them intelligently. Check git status to see the conflicting files, then resolve each conflict to preserve both sets of changes. Once all conflicts are resolved, commit the merge.`;

  // Launch agent with the conflict resolution prompt
  if (agent === 'claude') {
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
    const claudeCmd = `claude "${escapedPrompt}" --permission-mode=acceptEdits`;
    const escapedCmd = claudeCmd.replace(/'/g, "'\\''");

    execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, {
      stdio: 'pipe',
    });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

    // Auto-approve trust prompts for Claude
    autoApproveTrustPrompt(paneInfo).catch(() => {
      // Ignore errors in background monitoring
    });
  } else if (agent === 'opencode') {
    const openCoderCmd = `opencode`;
    const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''");

    execSync(`tmux send-keys -t '${paneInfo}' '${escapedOpenCmd}'`, {
      stdio: 'pipe',
    });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

    // Wait for opencode to start, then paste the prompt
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const bufName = `dmux_prompt_${Date.now()}`;
    const promptEsc = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");

    execSync(`tmux set-buffer -b '${bufName}' -- '${promptEsc}'`, {
      stdio: 'pipe',
    });
    execSync(`tmux paste-buffer -b '${bufName}' -t '${paneInfo}'`, {
      stdio: 'pipe',
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    execSync(`tmux delete-buffer -b '${bufName}'`, { stdio: 'pipe' });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
  }

  // Keep focus on the new pane
  execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });

  // Create the pane object
  const newPane: DmuxPane = {
    id: `dmux-${Date.now()}`,
    slug,
    prompt,
    paneId: paneInfo,
    agent,
    // Note: No worktreePath - this pane operates directly in the target repo
  };

  // Switch back to the original pane
  execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: 'pipe' });

  // Re-set the title for the dmux pane
  try {
    execSync(
      `tmux select-pane -t '${originalPaneId}' -T "dmux-${projectName}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Ignore if setting title fails
  }

  return newPane;
}

/**
 * Auto-approve Claude trust prompts (reused from paneCreation.ts)
 */
async function autoApproveTrustPrompt(paneInfo: string): Promise<void> {
  // Wait for Claude to start up before checking for prompts
  await new Promise((resolve) => setTimeout(resolve, 800));

  const maxChecks = 100;
  const checkInterval = 100;
  let lastContent = '';
  let stableContentCount = 0;
  let promptHandled = false;

  const trustPromptPatterns = [
    /Do you trust the files in this folder\?/i,
    /Trust the files in this workspace\?/i,
    /Do you trust the authors of the files/i,
    /Do you want to trust this workspace\?/i,
    /trust.*files.*folder/i,
    /trust.*workspace/i,
    /Do you trust/i,
    /Trust this folder/i,
    /trust.*directory/i,
    /permission.*grant/i,
    /allow.*access/i,
    /workspace.*trust/i,
    /accept.*edits/i,
    /permission.*mode/i,
    /allow.*claude/i,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Yes\/No/i,
    /\[Y\/n\]/i,
    /press.*enter.*accept/i,
    /press.*enter.*continue/i,
    /❯\s*1\.\s*Yes,\s*proceed/i,
    /Enter to confirm.*Esc to exit/i,
    /1\.\s*Yes,\s*proceed/i,
    /2\.\s*No,\s*exit/i,
  ];

  for (let i = 0; i < maxChecks; i++) {
    await new Promise((resolve) => setTimeout(resolve, checkInterval));

    try {
      const paneContent = capturePaneContent(paneInfo, 30);

      if (paneContent === lastContent) {
        stableContentCount++;
      } else {
        stableContentCount = 0;
        lastContent = paneContent;
      }

      const hasTrustPrompt = trustPromptPatterns.some((pattern) =>
        pattern.test(paneContent)
      );

      const hasClaudePermissionPrompt =
        paneContent.includes('Do you trust') ||
        paneContent.includes('trust the files') ||
        paneContent.includes('permission') ||
        paneContent.includes('allow') ||
        (paneContent.includes('folder') && paneContent.includes('?'));

      if ((hasTrustPrompt || hasClaudePermissionPrompt) && !promptHandled) {
        if (stableContentCount >= 2) {
          const isNewClaudeFormat =
            /❯\s*1\.\s*Yes,\s*proceed/i.test(paneContent) ||
            /Enter to confirm.*Esc to exit/i.test(paneContent);

          if (isNewClaudeFormat) {
            execSync(`tmux send-keys -t '${paneInfo}' Enter`, {
              stdio: 'pipe',
            });
          } else {
            execSync(`tmux send-keys -t '${paneInfo}' 'y'`, { stdio: 'pipe' });
            await new Promise((resolve) => setTimeout(resolve, 50));
            execSync(`tmux send-keys -t '${paneInfo}' Enter`, {
              stdio: 'pipe',
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            execSync(`tmux send-keys -t '${paneInfo}' Enter`, {
              stdio: 'pipe',
            });
          }

          promptHandled = true;
          await new Promise((resolve) => setTimeout(resolve, 500));

          const updatedContent = capturePaneContent(paneInfo, 10);

          const promptGone = !trustPromptPatterns.some((p) =>
            p.test(updatedContent)
          );

          if (promptGone) {
            break;
          }
        }
      }

      if (
        !hasTrustPrompt &&
        !hasClaudePermissionPrompt &&
        (paneContent.includes('Claude') || paneContent.includes('Assistant'))
      ) {
        break;
      }
    } catch {
      // Continue checking
    }
  }
}
