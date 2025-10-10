import { execSync } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import type { DmuxPane } from '../types.js';
import { applySmartLayout } from './tmux.js';
import { generateSlug } from './slug.js';
import { capturePaneContent } from './paneCapture.js';
import { triggerHook } from './hooks.js';

export interface CreatePaneOptions {
  prompt: string;
  agent?: 'claude' | 'opencode';
  projectName: string;
  existingPanes: DmuxPane[];
  projectRoot?: string;
}

export interface CreatePaneResult {
  pane: DmuxPane;
  needsAgentChoice: boolean;
}

/**
 * Core pane creation logic that can be used by both TUI and API
 * Returns the newly created pane and whether agent choice is needed
 */
export async function createPane(
  options: CreatePaneOptions,
  availableAgents: Array<'claude' | 'opencode'>
): Promise<CreatePaneResult> {
  const { prompt, projectName, existingPanes } = options;
  let { agent, projectRoot: optionsProjectRoot } = options;

  // Load settings to check for default agent and autopilot
  const { SettingsManager } = await import('./settingsManager.js');

  // Get project root (handle git worktrees correctly)
  let projectRoot: string;
  if (optionsProjectRoot) {
    projectRoot = optionsProjectRoot;
  } else {
    try {
      // For git worktrees, we need to get the main repository root, not the worktree root
      // git rev-parse --git-common-dir gives us the main .git directory
      const gitCommonDir = execSync('git rev-parse --git-common-dir', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      // If it's a worktree, gitCommonDir will be an absolute path to main .git
      // If it's the main repo, it will be just '.git'
      if (gitCommonDir === '.git') {
        // We're in the main repo
        projectRoot = execSync('git rev-parse --show-toplevel', {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
      } else {
        // We're in a worktree, get the parent directory of the .git directory
        projectRoot = path.dirname(gitCommonDir);
      }
    } catch {
      projectRoot = process.cwd();
    }
  }

  const settingsManager = new SettingsManager(projectRoot);
  const settings = settingsManager.getSettings();

  // If no agent specified, check settings for default agent
  if (!agent && settings.defaultAgent) {
    // Only use default if it's available
    if (availableAgents.includes(settings.defaultAgent)) {
      agent = settings.defaultAgent;
    }
  }

  // Determine if we need agent choice
  if (!agent && availableAgents.length > 1) {
    // Need to ask which agent to use
    return {
      pane: null as any,
      needsAgentChoice: true,
    };
  }

  // Auto-select agent if only one is available or if not specified
  if (!agent && availableAgents.length === 1) {
    agent = availableAgents[0];
  }

  // Trigger before_pane_create hook
  await triggerHook('before_pane_create', projectRoot, undefined, {
    DMUX_PROMPT: prompt,
    DMUX_AGENT: agent || 'unknown',
  });

  // Generate slug
  const slug = await generateSlug(prompt);

  const worktreePath = path.join(projectRoot, '.dmux', 'worktrees', slug);
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

  // Set pane title to match the slug
  try {
    execSync(`tmux select-pane -t '${paneInfo}' -T "${slug}"`, {
      stdio: 'pipe',
    });
  } catch {
    // Ignore if setting title fails
  }

  // Apply smart layout based on pane count
  const newPaneCount = paneCount + 1;
  applySmartLayout(newPaneCount);

  // Trigger pane_created hook (after pane created, before worktree)
  await triggerHook('pane_created', projectRoot, undefined, {
    DMUX_PANE_ID: `dmux-${Date.now()}`,
    DMUX_SLUG: slug,
    DMUX_PROMPT: prompt,
    DMUX_AGENT: agent || 'unknown',
    DMUX_TMUX_PANE_ID: paneInfo,
  });

  // Check if this is a hooks editing session (before worktree creation)
  const isHooksEditingSession = prompt && /edit.*dmux.*hooks/i.test(prompt);

  // Create git worktree and cd into it
  try {
    const worktreeCmd = `git worktree add "${worktreePath}" -b ${slug} 2>/dev/null ; cd "${worktreePath}"`;
    execSync(`tmux send-keys -t '${paneInfo}' '${worktreeCmd}' Enter`, {
      stdio: 'pipe',
    });

    // Wait for worktree to actually exist on the filesystem
    const maxWaitTime = 5000; // 5 seconds max
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    while (!fs.existsSync(worktreePath) && (Date.now() - startTime) < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Give a bit more time for git to finish setting up the worktree
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Initialize .dmux-hooks if this is a hooks editing session
    if (isHooksEditingSession) {
      const hooksDir = path.join(worktreePath, '.dmux-hooks');

      // Check if .dmux-hooks already exists
      if (!fs.existsSync(hooksDir)) {
        // Create the directory
        fs.mkdirSync(hooksDir, { recursive: true });

        // Import and write the documentation content
        const { AGENTS_MD } = await import('./generated-agents-doc.js');

        // Write AGENTS.md
        fs.writeFileSync(path.join(hooksDir, 'AGENTS.md'), AGENTS_MD, 'utf-8');

        // Copy to CLAUDE.md
        fs.writeFileSync(path.join(hooksDir, 'CLAUDE.md'), AGENTS_MD, 'utf-8');
      }
    }
  } catch (error) {
    // Even if worktree creation failed, try to cd to the directory
    execSync(
      `tmux send-keys -t '${paneInfo}' 'cd "${worktreePath}" 2>/dev/null || (echo "ERROR: Failed to create/enter worktree ${slug}" && pwd)' Enter`,
      { stdio: 'pipe' }
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Launch agent if specified
  if (agent === 'claude') {
    let claudeCmd: string;
    if (prompt && prompt.trim()) {
      const escapedPrompt = prompt
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      claudeCmd = `claude "${escapedPrompt}" --permission-mode=acceptEdits`;
    } else {
      claudeCmd = `claude --permission-mode=acceptEdits`;
    }
    const escapedCmd = claudeCmd.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, {
      stdio: 'pipe',
    });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

    // Auto-approve trust prompts for Claude
    autoApproveTrustPrompt(paneInfo, prompt).catch(() => {
      // Ignore errors in background monitoring
    });
  } else if (agent === 'opencode') {
    const openCoderCmd = `opencode`;
    const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t '${paneInfo}' '${escapedOpenCmd}'`, {
      stdio: 'pipe',
    });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

    if (prompt && prompt.trim()) {
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
  }

  // Keep focus on the new pane
  execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });

  // Create the pane object
  const newPane: DmuxPane = {
    id: `dmux-${Date.now()}`,
    slug,
    prompt: prompt || 'No initial prompt',
    paneId: paneInfo,
    worktreePath,
    agent,
    // Set autopilot based on settings (use ?? to properly handle false vs undefined)
    autopilot: settings.enableAutopilotByDefault ?? false,
  };

  // Trigger worktree_created hook (after full pane setup)
  await triggerHook('worktree_created', projectRoot, newPane);

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

  return {
    pane: newPane,
    needsAgentChoice: false,
  };
}

/**
 * Auto-approve Claude trust prompts
 */
async function autoApproveTrustPrompt(
  paneInfo: string,
  prompt: string
): Promise<void> {
  // Wait for Claude to start up before checking for prompts
  await new Promise((resolve) => setTimeout(resolve, 800));

  const maxChecks = 100; // 100 checks * 100ms = 10 seconds total
  const checkInterval = 100; // Check every 100ms
  let lastContent = '';
  let stableContentCount = 0;
  let promptHandled = false;

  // Trust prompt patterns
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
      // Capture the pane content
      const paneContent = capturePaneContent(paneInfo, 30);

      // Check if content has stabilized
      if (paneContent === lastContent) {
        stableContentCount++;
      } else {
        stableContentCount = 0;
        lastContent = paneContent;
      }

      // Look for trust prompt
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
        // Content is stable and we found a prompt
        if (stableContentCount >= 2) {
          // Check if this is the new Claude numbered menu format
          const isNewClaudeFormat =
            /❯\s*1\.\s*Yes,\s*proceed/i.test(paneContent) ||
            /Enter to confirm.*Esc to exit/i.test(paneContent);

          if (isNewClaudeFormat) {
            // For new Claude format, just press Enter
            execSync(`tmux send-keys -t '${paneInfo}' Enter`, {
              stdio: 'pipe',
            });
          } else {
            // Try multiple response methods for older formats
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

          // Wait and check if prompt is gone
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Verify the prompt is gone
          const updatedContent = capturePaneContent(paneInfo, 10);

          const promptGone = !trustPromptPatterns.some((p) =>
            p.test(updatedContent)
          );

          if (promptGone) {
            // Check if Claude is running
            const claudeRunning =
              updatedContent.includes('Claude') ||
              updatedContent.includes('claude') ||
              updatedContent.includes('Assistant') ||
              (prompt &&
                updatedContent.includes(
                  prompt.substring(0, Math.min(20, prompt.length))
                ));

            if (!claudeRunning && !updatedContent.includes('$')) {
              // Resend Claude command if needed
              await new Promise((resolve) => setTimeout(resolve, 300));
              // Note: We can't easily resend the command here without the escapedCmd
              // This is a limitation, but the TUI handles it
            }

            break;
          }
        }
      }

      // If Claude is already running, we're done
      if (
        !hasTrustPrompt &&
        !hasClaudePermissionPrompt &&
        (paneContent.includes('Claude') || paneContent.includes('Assistant'))
      ) {
        break;
      }
    } catch (error) {
      // Continue checking, errors are non-fatal
    }
  }
}
