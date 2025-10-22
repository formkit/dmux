import path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import type { DmuxPane, DmuxConfig } from '../types.js';
import { TmuxService } from '../services/TmuxService.js';
import {
  setupSidebarLayout,
  getContentPaneIds,
  getTerminalDimensions,
  splitPane,
} from './tmux.js';
import { SIDEBAR_WIDTH, recalculateAndApplyLayout } from './layoutManager.js';
import { generateSlug } from './slug.js';
import { capturePaneContent } from './paneCapture.js';
import { triggerHook } from './hooks.js';
import { TMUX_LAYOUT_APPLY_DELAY, TMUX_SPLIT_DELAY } from '../constants/timing.js';

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
  const tmuxService = TmuxService.getInstance();

  const worktreePath = path.join(projectRoot, '.dmux', 'worktrees', slug);
  const originalPaneId = tmuxService.getCurrentPaneIdSync();

  // Load config to get control pane info
  const configPath = path.join(projectRoot, '.dmux', 'dmux.config.json');
  let controlPaneId: string | undefined;

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: DmuxConfig = JSON.parse(configContent);
    controlPaneId = config.controlPaneId;

    // Verify the control pane ID from config still exists
    if (controlPaneId) {
      const exists = await tmuxService.paneExists(controlPaneId);
      if (!exists) {
        // Pane doesn't exist anymore, use current pane and update config
        console.error(`[dmux] Control pane ${controlPaneId} no longer exists, updating to ${originalPaneId}`);
        controlPaneId = originalPaneId;
        config.controlPaneId = controlPaneId;
        config.controlPaneSize = SIDEBAR_WIDTH;
        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
      // Else: Pane exists, we can use it
    }

    // If control pane ID is missing, save it
    if (!controlPaneId) {
      controlPaneId = originalPaneId;
      config.controlPaneId = controlPaneId;
      config.controlPaneSize = SIDEBAR_WIDTH;
      config.lastUpdated = new Date().toISOString();

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  } catch (error) {
    // Fallback if config loading fails
    controlPaneId = originalPaneId;
  }

  // Get current pane count
  const paneCount = tmuxService.getAllPaneIdsSync().length;

  // Enable pane borders to show titles
  try {
    tmuxService.setGlobalOptionSync('pane-border-status', 'top');
  } catch {
    // Ignore if already set or fails
  }

  // Determine if this is the first content pane
  // Check existingPanes instead of contentPaneIds, because contentPaneIds includes the welcome pane
  const isFirstContentPane = existingPanes.length === 0;

  let paneInfo: string;

  if (isFirstContentPane) {
    // First, create the tmux pane but DON'T destroy welcome pane yet
    // This way we can save the pane to config first, THEN destroy welcome pane
    paneInfo = setupSidebarLayout(controlPaneId);

    // Wait for pane creation to settle
    await new Promise((resolve) => setTimeout(resolve, 300));
  } else {
    // Subsequent panes - always split horizontally, let layout manager organize
    // Get actual dmux pane IDs (not welcome pane) from existingPanes
    const dmuxPaneIds = existingPanes.map(p => p.paneId);
    const targetPane = dmuxPaneIds[dmuxPaneIds.length - 1]; // Split from the most recent dmux pane

    // Always split horizontally - the layout manager will organize panes optimally
    paneInfo = splitPane({ targetPane });
  }

  // Wait for pane creation to settle
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Set pane title to match the slug
  try {
    await tmuxService.setPaneTitle(paneInfo, slug);
  } catch {
    // Ignore if setting title fails
  }

  // Apply optimal layout using the layout manager
  if (controlPaneId) {
    const dimensions = getTerminalDimensions();
    const allContentPaneIds = [...existingPanes.map(p => p.paneId), paneInfo];

    await recalculateAndApplyLayout(
      controlPaneId,
      allContentPaneIds,
      dimensions.width,
      dimensions.height
    );

    // Refresh tmux to apply changes
    await tmuxService.refreshClient();
  }

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
    // IMPORTANT: Prune stale worktrees first to avoid conflicts
    // This must run synchronously from dmux, not in the pane
    try {
      execSync('git worktree prune', {
        encoding: 'utf-8',
        stdio: 'pipe',
        cwd: projectRoot,
      });
    } catch {
      // Ignore prune errors, proceed anyway
    }

    // Check if branch already exists (from a deleted worktree)
    let branchExists = false;
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${slug}`, {
        stdio: 'pipe',
        cwd: projectRoot,
      });
      branchExists = true;
    } catch {
      // Branch doesn't exist, which is good
    }

    // Build worktree command:
    // - If branch exists, use it (don't create with -b)
    // - If branch doesn't exist, create it with -b
    // - DON'T silence errors (we want to see them in the pane for debugging)
    const worktreeCmd = branchExists
      ? `git worktree add "${worktreePath}" ${slug} && cd "${worktreePath}"`
      : `git worktree add "${worktreePath}" -b ${slug} && cd "${worktreePath}"`;

    // Send the git worktree command (auto-quoted by sendShellCommand)
    await tmuxService.sendShellCommand(paneInfo, worktreeCmd);
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');

    // Wait for worktree to actually exist on the filesystem
    const maxWaitTime = 5000; // 5 seconds max
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    while (!fs.existsSync(worktreePath) && (Date.now() - startTime) < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Verify worktree was created successfully
    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory not created at ${worktreePath} after ${maxWaitTime}ms`);
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
    // Worktree creation failed - send helpful error message to the pane
    const errorMsg = error instanceof Error ? error.message : String(error);
    await tmuxService.sendShellCommand(
      paneInfo,
      `echo "❌ Failed to create worktree: ${errorMsg}"`
    );
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
    await tmuxService.sendShellCommand(
      paneInfo,
      `echo "Tip: Try running: git worktree prune && git branch -D ${slug}"`
    );
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
    await new Promise((resolve) => setTimeout(resolve, TMUX_LAYOUT_APPLY_DELAY));

    // Don't throw - let the pane stay open so user can debug
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
    // Send the claude command (auto-quoted by sendShellCommand)
    await tmuxService.sendShellCommand(paneInfo, claudeCmd);
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');

    // Auto-approve trust prompts for Claude
    autoApproveTrustPrompt(paneInfo, prompt).catch(() => {
      // Ignore errors in background monitoring
    });
  } else if (agent === 'opencode') {
    await tmuxService.sendShellCommand(paneInfo, 'opencode');
    await tmuxService.sendTmuxKeys(paneInfo, 'Enter');

    if (prompt && prompt.trim()) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const bufName = `dmux_prompt_${Date.now()}`;
      const promptEsc = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
      await tmuxService.setBuffer(bufName, promptEsc);
      await tmuxService.pasteBuffer(bufName, paneInfo);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await tmuxService.deleteBuffer(bufName);
      await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
    }
  }

  // Keep focus on the new pane
  await tmuxService.selectPane(paneInfo);

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

  // CRITICAL: Save the pane to config IMMEDIATELY before destroying welcome pane
  // This is the event that triggers welcome pane destruction (event-based, no polling)
  if (isFirstContentPane) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: DmuxConfig = JSON.parse(configContent);

      // Add the new pane to the config (panesCount becomes 1)
      config.panes = [...existingPanes, newPane];
      config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // NOW destroy the welcome pane (event-based destruction)
      const { destroyWelcomePaneCoordinated } = await import('./welcomePaneManager.js');
      destroyWelcomePaneCoordinated(projectRoot);
    } catch (error) {
      // Log but don't fail - welcome pane cleanup is not critical
    }
  }

  // Trigger worktree_created hook (after full pane setup)
  await triggerHook('worktree_created', projectRoot, newPane);

  // Switch back to the original pane
  await tmuxService.selectPane(originalPaneId);

  // Re-set the title for the dmux pane
  try {
    await tmuxService.setPaneTitle(originalPaneId, `dmux-${projectName}`);
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

          const tmuxService = TmuxService.getInstance();
          if (isNewClaudeFormat) {
            // For new Claude format, just press Enter
            await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
          } else {
            // Try multiple response methods for older formats
            await tmuxService.sendTmuxKeys(paneInfo, 'y');
            await new Promise((resolve) => setTimeout(resolve, 50));
            await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
            await new Promise((resolve) => setTimeout(resolve, TMUX_SPLIT_DELAY));
            await tmuxService.sendTmuxKeys(paneInfo, 'Enter');
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
