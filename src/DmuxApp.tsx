import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

// Hooks
import usePanes from './hooks/usePanes.js';
import useProjectSettings from './hooks/useProjectSettings.js';
import useTerminalWidth from './hooks/useTerminalWidth.js';
import useNavigation from './hooks/useNavigation.js';
import useAutoUpdater from './hooks/useAutoUpdater.js';
import useAgentDetection from './hooks/useAgentDetection.js';
import useAgentStatus from './hooks/useAgentStatus.js';
import useWorktreeActions from './hooks/useWorktreeActions.js';
import usePaneRunner from './hooks/usePaneRunner.js';
import usePaneCreation from './hooks/usePaneCreation.js';

// Utils
import { getPanePositions, applySmartLayout } from './utils/tmux.js';
import { suggestCommand } from './utils/commands.js';
import { generateSlug } from './utils/slug.js';
import { getMainBranch } from './utils/git.js';
import { StateManager } from './shared/StateManager.js';
import { getStatusDetector, type StatusUpdateEvent } from './services/StatusDetector.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
import type { DmuxPane, PanePosition, ProjectSettings, DmuxAppProps } from './types.js';
import PanesGrid from './components/PanesGrid.js';
import NewPaneDialog from './components/NewPaneDialog.js';
import AgentChoiceDialog from './components/AgentChoiceDialog.js';
import CloseOptionsDialog from './components/CloseOptionsDialog.js';
import MergeConfirmationDialog from './components/MergeConfirmationDialog.js';
import CommandPromptDialog from './components/CommandPromptDialog.js';
import FileCopyPrompt from './components/FileCopyPrompt.js';
import LoadingIndicator from './components/LoadingIndicator.js';
import RunningIndicator from './components/RunningIndicator.js';
import UpdatingIndicator from './components/UpdatingIndicator.js';
import CreatingIndicator from './components/CreatingIndicator.js';
import FooterHelp from './components/FooterHelp.js';
import MergePane from './MergePane.js';
import QRCode from './components/QRCode.js';


const DmuxApp: React.FC<DmuxAppProps> = ({ panesFile, projectName, sessionName, settingsFile, autoUpdater, serverPort, server }) => {
  /* panes state moved to usePanes */
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showNewPaneDialog, setShowNewPaneDialog] = useState(false);
  const [newPanePrompt, setNewPanePrompt] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showMergeConfirmation, setShowMergeConfirmation] = useState(false);
  const [mergedPane, setMergedPane] = useState<DmuxPane | null>(null);
  const [showMergePane, setShowMergePane] = useState(false);
  const [mergingPane, setMergingPane] = useState<DmuxPane | null>(null);
  const [showCloseOptions, setShowCloseOptions] = useState(false);
  const [selectedCloseOption, setSelectedCloseOption] = useState(0);
  const [closingPane, setClosingPane] = useState<DmuxPane | null>(null);
  const [isCreatingPane, setIsCreatingPane] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [isCreatingTunnel, setIsCreatingTunnel] = useState(false);
  const { projectSettings, saveSettings } = useProjectSettings(settingsFile);
  const [showCommandPrompt, setShowCommandPrompt] = useState<'test' | 'dev' | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [showFileCopyPrompt, setShowFileCopyPrompt] = useState(false);
  const [currentCommandType, setCurrentCommandType] = useState<'test' | 'dev' | null>(null);
  const [runningCommand, setRunningCommand] = useState(false);
  // Update state handled by hook
  const { updateInfo, showUpdateDialog, isUpdating, performUpdate, skipUpdate, dismissUpdate, updateAvailable } = useAutoUpdater(autoUpdater, setStatusMessage);
  const { exit } = useApp();

  // Agent selection state
  const { availableAgents } = useAgentDetection();
  const [showAgentChoiceDialog, setShowAgentChoiceDialog] = useState(false);
  const [agentChoice, setAgentChoice] = useState<'claude' | 'opencode' | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState('');

  // Track terminal dimensions for responsive layout
  const terminalWidth = useTerminalWidth();

  // Panes state and persistence
  const skipLoading = showNewPaneDialog || showMergeConfirmation || showCloseOptions ||
    !!showCommandPrompt || showFileCopyPrompt || showMergePane;
  const { panes, setPanes, isLoading, loadPanes, savePanes } = usePanes(panesFile, skipLoading);

  // Worktree actions
  const { closePane, mergeWorktree, mergeAndPrune, deleteUnsavedChanges, handleCloseOption } = useWorktreeActions({
    panes,
    savePanes,
    setStatusMessage,
    setShowMergeConfirmation,
    setMergedPane,
  });

  // Pane runner
  const { copyNonGitFiles, runCommandInternal, monitorTestOutput, monitorDevOutput, attachBackgroundWindow } = usePaneRunner({
    panes,
    savePanes,
    projectSettings,
    setStatusMessage,
    setRunningCommand,
  });

  // Pane creation
  const { openInEditor: openEditor2, createNewPane: createNewPaneHook } = usePaneCreation({
    panes,
    savePanes,
    projectName,
    setIsCreatingPane,
    setStatusMessage,
    setNewPanePrompt,
    loadPanes,
    panesFile,
  });
  
  // Sync panes with StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance();
    stateManager.updatePanes(panes);
  }, [panes]);

  // Listen for status updates with analysis data and merge into panes
  useEffect(() => {
    const statusDetector = getStatusDetector();

    const handleStatusUpdate = (event: StatusUpdateEvent) => {
      setPanes(prevPanes => {
        return prevPanes.map(pane => {
          if (pane.id === event.paneId) {
            return {
              ...pane,
              agentStatus: event.status,
              optionsQuestion: event.optionsQuestion,
              options: event.options,
              potentialHarm: event.potentialHarm
            };
          }
          return pane;
        });
      });
    };

    statusDetector.on('status-updated', handleStatusUpdate);

    return () => {
      statusDetector.off('status-updated', handleStatusUpdate);
    };
  }, [setPanes]);

  // Sync settings with StateManager
  useEffect(() => {
    const stateManager = StateManager.getInstance();
    stateManager.updateSettings(projectSettings);
  }, [projectSettings]);

  // Load panes and settings on mount and refresh periodically
  useEffect(() => {
    // Add cleanup handlers for process termination
    const handleTermination = () => {
      // Clear screen multiple times to ensure no artifacts
      process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to home
      process.stdout.write('\x1b[3J'); // Clear scrollback buffer
      process.stdout.write('\n'.repeat(100)); // Push any remaining content off screen

      // Clear tmux pane
      try {
        execSync('tmux clear-history', { stdio: 'pipe' });
        execSync('tmux send-keys C-l', { stdio: 'pipe' });
      } catch {}

      // Wait a moment for clearing to settle, then show goodbye message
      setTimeout(() => {
        process.stdout.write('\x1b[2J\x1b[H');
        process.stdout.write('\n\n  dmux session ended.\n\n');
        process.exit(0);
      }, 100);
    };

    process.on('SIGINT', handleTermination);
    process.on('SIGTERM', handleTermination);

    return () => {
      process.removeListener('SIGINT', handleTermination);
      process.removeListener('SIGTERM', handleTermination);
    };
  }, []);

  // Auto-show new pane dialog when starting with no panes
  useEffect(() => {
    // Only show the dialog if:
    // 1. Initial load is complete (!isLoading)
    // 2. We have no panes
    // 3. We're not already showing the dialog
    // 4. We're not showing any other dialogs or prompts
    if (!isLoading &&
        panes.length === 0 && 
        !showNewPaneDialog && 
        !showMergeConfirmation && 
        !showCloseOptions && 
        !showCommandPrompt && 
        !showFileCopyPrompt && 
        !showAgentChoiceDialog &&
        !isCreatingPane &&
        !runningCommand &&
        !isUpdating) {
      setShowNewPaneDialog(true);
    }
  }, [isLoading, panes.length, showNewPaneDialog, showMergeConfirmation, showCloseOptions, showCommandPrompt, showFileCopyPrompt, showAgentChoiceDialog, isCreatingPane, runningCommand, isUpdating]);

  // Update checking moved to useAutoUpdater

  // Set default agent choice when detection completes
  useEffect(() => {
    if (agentChoice == null && availableAgents.length > 0) {
      setAgentChoice(availableAgents[0] || 'claude');
    }
  }, [availableAgents]);

  // Monitor agent status across panes (returns a map of pane ID to status)
  const agentStatuses = useAgentStatus({
    panes,
    suspend: showNewPaneDialog || showMergeConfirmation || showCloseOptions || !!showCommandPrompt || showFileCopyPrompt || showMergePane,
    onPaneRemoved: (paneId: string) => {
      // Remove pane from list when it no longer exists in tmux
      const updatedPanes = panes.filter(p => p.id !== paneId);
      savePanes(updatedPanes);
    },
  });



  // loadPanes moved to usePanes

  // getPanePositions moved to utils/tmux

  // Navigation logic moved to hook
  const { getCardGridPosition, findCardInDirection } = useNavigation(terminalWidth, panes.length, isLoading);

  // findCardInDirection provided by useNavigation


  // savePanes moved to usePanes

  // applySmartLayout moved to utils/tmux






  const createNewPane = async (prompt: string, agent?: 'claude' | 'opencode') => {
    setIsCreatingPane(true);
    setStatusMessage('Generating slug...');
    
    const slug = await generateSlug(prompt);
    
    setStatusMessage(`Creating worktree: ${slug}...`);
    
    // Get git root directory for consistent worktree placement
    let projectRoot: string;
    try {
      projectRoot = execSync('git rev-parse --show-toplevel', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
    } catch {
      // Fallback to current directory if not in a git repo
      projectRoot = process.cwd();
    }
    
    // Create worktree path inside .dmux/worktrees directory
    const worktreePath = path.join(projectRoot, '.dmux', 'worktrees', slug);
    
    // Get the original pane ID (where dmux is running) before clearing
    const originalPaneId = execSync('tmux display-message -p "#{pane_id}"', { encoding: 'utf-8' }).trim();
    
    // Multiple clearing strategies to prevent artifacts
    // 1. Clear screen with ANSI codes
    process.stdout.write('\x1b[2J\x1b[H');
    
    // 2. Fill with blank lines to push content off screen
    process.stdout.write('\n'.repeat(100));
    
    // 3. Clear tmux history and send clear command
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux send-keys C-l', { stdio: 'pipe' });
    } catch {}
    
    // Wait a bit for clearing to settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 4. Force tmux to refresh the display
    try {
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch {}
    
    // Get current pane count to determine layout
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
    const paneInfo = execSync(
      `tmux split-window -h -P -F '#{pane_id}'`,
      { encoding: 'utf-8' }
    ).trim();
    
    // Wait for pane creation to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Set pane title to match the slug
    try {
      execSync(`tmux select-pane -t '${paneInfo}' -T "${slug}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Apply smart layout based on pane count
    const newPaneCount = paneCount + 1;
    applySmartLayout(newPaneCount);
    
    // Create git worktree and cd into it
    // This MUST happen before launching Claude to ensure we're in the right directory
    try {
      // First, create the worktree and cd into it as a single command
      // Use ; instead of && to ensure cd runs even if worktree already exists
      const worktreeCmd = `git worktree add "${worktreePath}" -b ${slug} 2>/dev/null ; cd "${worktreePath}"`;
      execSync(`tmux send-keys -t '${paneInfo}' '${worktreeCmd}' Enter`, { stdio: 'pipe' });
      
      // Wait longer for worktree creation and cd to complete
      // This is critical - if we don't wait long enough, Claude will start in the wrong directory
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Verify we're in the worktree directory by sending pwd command  
      execSync(`tmux send-keys -t '${paneInfo}' 'echo "Worktree created at:" && pwd' Enter`, { stdio: 'pipe' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setStatusMessage(agent ? `Worktree created, launching ${agent === 'opencode' ? 'opencode' : 'Claude'}...` : 'Worktree created.');
    } catch (error) {
      // Log error but continue - worktree creation is essential
      setStatusMessage(`Warning: Worktree issue: ${error}`);
      // Even if worktree creation failed, try to cd to the directory in case it exists
      execSync(`tmux send-keys -t '${paneInfo}' 'cd "${worktreePath}" 2>/dev/null || (echo "ERROR: Failed to create/enter worktree ${slug}" && pwd)' Enter`, { stdio: 'pipe' });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Prepare and send the agent command
    let escapedCmd = '';
    if (agent === 'claude') {
      // Claude should always be launched AFTER we're in the worktree directory
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
      // Send Claude command to new pane
      escapedCmd = claudeCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
    } else if (agent === 'opencode') {
      // opencode: start the TUI, then paste the prompt and submit
      const openCoderCmd = `opencode`;
      const escapedOpenCmd = openCoderCmd.replace(/'/g, "'\\''");
      execSync(`tmux send-keys -t '${paneInfo}' '${escapedOpenCmd}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      if (prompt && prompt.trim()) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const bufName = `dmux_prompt_${Date.now()}`;
        const promptEsc = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        execSync(`tmux set-buffer -b '${bufName}' -- '${promptEsc}'`, { stdio: 'pipe' });
        execSync(`tmux paste-buffer -b '${bufName}' -t '${paneInfo}'`, { stdio: 'pipe' });
        await new Promise(resolve => setTimeout(resolve, 200));
        execSync(`tmux delete-buffer -b '${bufName}'`, { stdio: 'pipe' });
        execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
      }
    }
    
    if (agent === 'claude') {
      // Monitor for Claude Code trust prompt and auto-respond
    const autoApproveTrust = async () => {
      // Wait for Claude to start up before checking for prompts
      await new Promise(resolve => setTimeout(resolve, 800));

      const maxChecks = 100; // 100 checks * 100ms = 10 seconds total
      const checkInterval = 100; // Check every 100ms
      let lastContent = '';
      let stableContentCount = 0;
      let promptHandled = false;
      
      // More comprehensive trust prompt patterns
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
        /accept.*edits/i,  // Claude's accept edits prompt
        /permission.*mode/i,  // Permission mode prompt
        /allow.*claude/i,  // Allow Claude prompt
        /\[y\/n\]/i, // Common yes/no prompt pattern
        /\(y\/n\)/i,
        /Yes\/No/i,
        /\[Y\/n\]/i,  // Default yes pattern
        /press.*enter.*accept/i,  // Press enter to accept
        /press.*enter.*continue/i,  // Press enter to continue
        /❯\s*1\.\s*Yes,\s*proceed/i,  // New Claude numbered menu format
        /Enter to confirm.*Esc to exit/i,  // New Claude confirmation format
        /1\.\s*Yes,\s*proceed/i,  // Yes proceed option
        /2\.\s*No,\s*exit/i  // No exit option
      ];
      
      for (let i = 0; i < maxChecks; i++) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));

        try {
          // Capture the pane content
          const paneContent = execSync(
            `tmux capture-pane -t '${paneInfo}' -p -S -30`,  // Capture last 30 lines
            { encoding: 'utf-8', stdio: 'pipe' }
          );

          if (i % 10 === 0) {  // Log every 10 checks (every second)
          }
          
          // Check if content has stabilized (same for 3 checks = prompt is waiting)
          if (paneContent === lastContent) {
            stableContentCount++;
          } else {
            stableContentCount = 0;
            lastContent = paneContent;
          }
          
          // Look for trust prompt in the current content
          const hasTrustPrompt = trustPromptPatterns.some(pattern => 
            pattern.test(paneContent)
          );
          
          // Also check if we see specific Claude permission text
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
              const isNewClaudeFormat = /❯\s*1\.\s*Yes,\s*proceed/i.test(paneContent) ||
                                      /Enter to confirm.*Esc to exit/i.test(paneContent);

              if (isNewClaudeFormat) {
                // For new Claude format, just press Enter to confirm default "Yes, proceed"
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
              } else {
                // Try multiple response methods for older formats

                // Method 1: Send 'y' followed by Enter (most explicit)
                execSync(`tmux send-keys -t '${paneInfo}' 'y'`, { stdio: 'pipe' });
                await new Promise(resolve => setTimeout(resolve, 50));
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });

                // Method 2: Just Enter (if it's a yes/no with default yes)
                await new Promise(resolve => setTimeout(resolve, 100));
                execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
              }
              
              // Mark as handled to avoid duplicate responses
              promptHandled = true;
              
              // Wait and check if prompt is gone
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify the prompt is gone
              const updatedContent = execSync(
                `tmux capture-pane -t '${paneInfo}' -p -S -10`,
                { encoding: 'utf-8', stdio: 'pipe' }
              );
              
              // If trust prompt is gone, check if we need to resend the Claude command
              const promptGone = !trustPromptPatterns.some(p => p.test(updatedContent));
              
              if (promptGone) {
                // Check if Claude is running or if we need to restart it
                const claudeRunning =
                  updatedContent.includes('Claude') ||
                  updatedContent.includes('claude') ||
                  updatedContent.includes('Assistant') ||
                  (prompt && updatedContent.includes(prompt.substring(0, Math.min(20, prompt.length))));


                if (!claudeRunning && !updatedContent.includes('$')) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                  execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
                  execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
                }

                break;
              }
            }
          }
          
          // If we see Claude is already running without prompts, we're done
          if (!hasTrustPrompt && !hasClaudePermissionPrompt && 
              (paneContent.includes('Claude') || paneContent.includes('Assistant'))) {
            break;
          }
        } catch (error) {
          // Continue checking, errors are non-fatal
        }
      }
    };
    
    // Start monitoring for trust prompt in background
    autoApproveTrust().catch(err => {
    });
    }
    
    // Keep focus on the new pane
    execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });
    
    // Save pane info
    const newPane: DmuxPane = {
      id: `dmux-${Date.now()}`,
      slug,
      prompt: prompt || 'No initial prompt',
      paneId: paneInfo,
      worktreePath,
      agent
    };
    
    const updatedPanes = [...panes, newPane];
    await savePanes(updatedPanes);
    
    // Switch back to the original pane (where dmux is running)
    execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: 'pipe' });
    
    // Re-set the title for the dmux pane
    try {
      execSync(`tmux select-pane -t '${originalPaneId}' -T "dmux-${projectName}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Clear the screen and redraw the UI
    process.stdout.write('\x1b[2J\x1b[H');
    
    // Reset the creating pane flag and refresh
    setIsCreatingPane(false);
    setStatusMessage('');
    setNewPanePrompt('');
    
    // Force a reload of panes to ensure UI is up to date
    await loadPanes();
  };

  const jumpToPane = (paneId: string) => {
    try {
      // Enable pane borders to show titles (if not already enabled)
      try {
        execSync(`tmux set-option -g pane-border-status top`, { stdio: 'pipe' });
      } catch {
        // Ignore if already set or fails
      }
      
      execSync(`tmux select-pane -t '${paneId}'`, { stdio: 'pipe' });
      setStatusMessage('Jumped to pane');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage('Failed to jump - pane may be closed');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };









  const runCommand = async (type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree path for this pane');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    const command = type === 'test' ? projectSettings.testCommand : projectSettings.devCommand;
    const isFirstRun = type === 'test' ? !projectSettings.firstTestRun : !projectSettings.firstDevRun;
    
    if (!command) {
      // No command configured, prompt user
      setShowCommandPrompt(type);
      return;
    }
    
    // Check if this is the first run and offer to copy non-git files
    if (isFirstRun) {
      // Show file copy prompt and wait for response
      setShowFileCopyPrompt(true);
      setCurrentCommandType(type);
      setStatusMessage(`First time running ${type} command...`);
      
      // Return here - the actual command will be run after user responds to prompt
      return;
    }

    try {
      setRunningCommand(true);
      setStatusMessage(`Starting ${type} in background window...`);
      
      // Kill existing window if present
      const existingWindowId = type === 'test' ? pane.testWindowId : pane.devWindowId;
      if (existingWindowId) {
        try {
          execSync(`tmux kill-window -t '${existingWindowId}'`, { stdio: 'pipe' });
        } catch {}
      }
      
      // Create a new background window for the command
      const windowName = `${pane.slug}-${type}`;
      const windowId = execSync(
        `tmux new-window -d -n '${windowName}' -P -F '#{window_id}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      
      // Create a log file to capture output
      const logFile = `/tmp/dmux-${pane.id}-${type}.log`;
      
      // Build the command with output capture
      const fullCommand = type === 'test'
        ? `cd "${pane.worktreePath}" && ${command} 2>&1 | tee ${logFile}`
        : `cd "${pane.worktreePath}" && ${command} 2>&1 | tee ${logFile}`;
      
      // Send the command to the new window
      execSync(`tmux send-keys -t '${windowId}' '${fullCommand.replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${windowId}' Enter`, { stdio: 'pipe' });
      
      // Update pane with window info
      const updatedPane: DmuxPane = {
        ...pane,
        [type === 'test' ? 'testWindowId' : 'devWindowId']: windowId,
        [type === 'test' ? 'testStatus' : 'devStatus']: 'running'
      };
      
      const updatedPanes = panes.map(p => p.id === pane.id ? updatedPane : p);
      await savePanes(updatedPanes);
      
      // Start monitoring the output
      if (type === 'test') {
        // For tests, monitor for completion
        setTimeout(() => monitorTestOutput(pane.id, logFile), 2000);
      } else {
        // For dev, monitor for server URL
        setTimeout(() => monitorDevOutput(pane.id, logFile), 2000);
      }
      
      setRunningCommand(false);
      setStatusMessage(`${type === 'test' ? 'Test' : 'Dev server'} started in background`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setRunningCommand(false);
      setStatusMessage(`Failed to run ${type} command`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };
  



  // Update handling moved to useAutoUpdater

  // Cleanup function for exit
  const cleanExit = () => {
    // Clear screen multiple times to ensure no artifacts
    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move to home
    process.stdout.write('\x1b[3J'); // Clear scrollback buffer
    process.stdout.write('\n'.repeat(100)); // Push any remaining content off screen

    // Clear tmux pane
    try {
      execSync('tmux clear-history', { stdio: 'pipe' });
      execSync('tmux send-keys C-l', { stdio: 'pipe' });
    } catch {}

    // Wait a moment for clearing to settle
    setTimeout(() => {
      // Final clear and show goodbye message
      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write('\n\n  dmux session ended.\n\n');

      // Exit the app
      exit();
    }, 100);
  };

  useInput(async (input: string, key: any) => {
    if (isCreatingPane || runningCommand || isUpdating || isLoading || isCreatingTunnel) {
      // Disable input while performing operations or loading
      return;
    }

    // Handle QR code view
    if (showQRCode) {
      if (key.escape) {
        setShowQRCode(false);
      }
      return;
    }

    if (showFileCopyPrompt) {
      if (input === 'y' || input === 'Y') {
        setShowFileCopyPrompt(false);
        const selectedPane = panes[selectedIndex];
        if (selectedPane && selectedPane.worktreePath && currentCommandType) {
          await copyNonGitFiles(selectedPane.worktreePath);
          
          // Mark as not first run and continue with command
          const newSettings = {
            ...projectSettings,
            [currentCommandType === 'test' ? 'firstTestRun' : 'firstDevRun']: true
          };
          await saveSettings(newSettings);
          
          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane);
        }
        setCurrentCommandType(null);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setShowFileCopyPrompt(false);
        const selectedPane = panes[selectedIndex];
        if (selectedPane && currentCommandType) {
          // Mark as not first run and continue without copying
          const newSettings = {
            ...projectSettings,
            [currentCommandType === 'test' ? 'firstTestRun' : 'firstDevRun']: true
          };
          await saveSettings(newSettings);
          
          // Now run the actual command
          await runCommandInternal(currentCommandType, selectedPane);
        }
        setCurrentCommandType(null);
    }
     return;
   }
   
   if (showAgentChoiceDialog) {
     if (key.escape) {
       setShowAgentChoiceDialog(false);
       setShowNewPaneDialog(true);
       setNewPanePrompt(pendingPrompt);
       setPendingPrompt('');
     } else if (key.leftArrow || input === '1' || (input && input.toLowerCase() === 'c')) {
       setAgentChoice('claude');
     } else if (key.rightArrow || input === '2' || (input && input.toLowerCase() === 'o')) {
       setAgentChoice('opencode');
     } else if (key.return) {
       const chosen = agentChoice || (availableAgents[0] || 'claude');
       const promptValue = pendingPrompt;
       setShowAgentChoiceDialog(false);
       setPendingPrompt('');
       await createNewPane(promptValue, chosen);
       setNewPanePrompt('');
     }
     return;
   }
   
   if (showCommandPrompt) {
      if (key.escape) {
        setShowCommandPrompt(null);
        setCommandInput('');
      } else if (key.return) {
        if (commandInput.trim() === '') {
          // If empty, suggest a default command based on package manager
          const suggested = await suggestCommand(showCommandPrompt);
          if (suggested) {
            setCommandInput(suggested);
          }
        } else {
          // User provided manual command
          const newSettings = {
            ...projectSettings,
            [showCommandPrompt === 'test' ? 'testCommand' : 'devCommand']: commandInput.trim()
          };
          await saveSettings(newSettings);
          const selectedPane = panes[selectedIndex];
          if (selectedPane) {
            // Check if first run
            const isFirstRun = showCommandPrompt === 'test' ? !projectSettings.firstTestRun : !projectSettings.firstDevRun;
            if (isFirstRun) {
              setCurrentCommandType(showCommandPrompt);
              setShowCommandPrompt(null);
              setShowFileCopyPrompt(true);
            } else {
              await runCommandInternal(showCommandPrompt, selectedPane);
              setShowCommandPrompt(null);
              setCommandInput('');
            }
          } else {
            setShowCommandPrompt(null);
            setCommandInput('');
          }
        }
      }
      return;
    }
    
    if (showMergePane) {
      // MergePane handles its own input
      return;
    }

    if (showNewPaneDialog) {
      if (key.escape) {
        setShowNewPaneDialog(false);
        setNewPanePrompt('');
      } else if (key.ctrl && input === 'o') {
        // Open in external editor
        openEditor2(newPanePrompt, setNewPanePrompt);
      }
      // TextInput handles other input events
      return;
    }

    if (showMergeConfirmation) {
      if (input === 'y' || input === 'Y') {
        if (mergedPane) {
          closePane(mergedPane);
        }
        setShowMergeConfirmation(false);
        setMergedPane(null);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setShowMergeConfirmation(false);
        setMergedPane(null);
      }
      return;
    }

    if (showCloseOptions) {
      if (key.escape) {
        setShowCloseOptions(false);
        setClosingPane(null);
        setSelectedCloseOption(0);
      } else if (key.upArrow) {
        setSelectedCloseOption(Math.max(0, selectedCloseOption - 1));
      } else if (key.downArrow) {
        setSelectedCloseOption(Math.min(3, selectedCloseOption + 1));
      } else if (key.return && closingPane) {
        handleCloseOption(selectedCloseOption, closingPane).then(() => {
          // Close the dialog after the action is performed
          setShowCloseOptions(false);
          setClosingPane(null);
          setSelectedCloseOption(0);
        }).catch(error => {
          setStatusMessage('Failed to close pane');
          setTimeout(() => setStatusMessage(''), 2000);
          // Also close the dialog on error
          setShowCloseOptions(false);
          setClosingPane(null);
          setSelectedCloseOption(0);
        });
      }
      return;
    }

    // Handle directional navigation with spatial awareness based on card grid layout
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      let targetIndex: number | null = null;
      
      if (key.upArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'up');
      } else if (key.downArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'down');
      } else if (key.leftArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'left');
      } else if (key.rightArrow) {
        targetIndex = findCardInDirection(selectedIndex, 'right');
      }
      
      if (targetIndex !== null) {
        setSelectedIndex(targetIndex);
      }
      return;
    }
    
    if (input === 'q') {
      cleanExit();
    } else if (input === 'r' && server) {
      // Create tunnel if not already created, then show QR code
      if (!tunnelUrl) {
        setIsCreatingTunnel(true);
        setStatusMessage('Creating tunnel...');
        try {
          const url = await server.startTunnel();
          setTunnelUrl(url);
          setStatusMessage('');
          setShowQRCode(true);
        } catch (error) {
          setStatusMessage('Failed to create tunnel');
          setTimeout(() => setStatusMessage(''), 3000);
        } finally {
          setIsCreatingTunnel(false);
        }
      } else {
        // Tunnel already exists, just show the QR code
        setShowQRCode(true);
      }
    } else if (!isLoading && (input === 'n' || (key.return && selectedIndex === panes.length))) {
      // Clear the prompt and show dialog in next tick to prevent 'n' bleeding through
      setNewPanePrompt('');
      setShowNewPaneDialog(true);
      return; // Consume the 'n' keystroke so it doesn't propagate
    } else if (input === 'j' && selectedIndex < panes.length) {
      jumpToPane(panes[selectedIndex].paneId);
    } else if (input === 'x' && selectedIndex < panes.length) {
      setClosingPane(panes[selectedIndex]);
      setShowCloseOptions(true);
      setSelectedCloseOption(0);
    } else if (input === 'm' && selectedIndex < panes.length) {
      setMergingPane(panes[selectedIndex]);
      setShowMergePane(true);
    } else if (input === 't' && selectedIndex < panes.length) {
      await runCommand('test', panes[selectedIndex]);
    } else if (input === 'd' && selectedIndex < panes.length) {
      await runCommand('dev', panes[selectedIndex]);
    } else if (input === 'o' && selectedIndex < panes.length) {
      const pane = panes[selectedIndex];
      if (pane.testWindowId || pane.devWindowId) {
        // If both exist, prefer dev (since it's usually more interactive)
        if (pane.devWindowId && pane.devStatus === 'running') {
          await attachBackgroundWindow(pane, 'dev');
        } else if (pane.testWindowId) {
          await attachBackgroundWindow(pane, 'test');
        }
      } else {
        setStatusMessage('No test or dev window to open');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    } else if (key.return && selectedIndex < panes.length) {
      jumpToPane(panes[selectedIndex].paneId);
    }
  });

  // If showing merge pane, render only that
  if (showMergePane && mergingPane) {
    return (
      <MergePane
        pane={mergingPane}
        mainBranch={getMainBranch()}
        onComplete={() => {
          // Clean up worktree and branch after successful merge, then close the pane
          if (mergingPane.worktreePath) {
            try {
              const mainRepoPath = mergingPane.worktreePath.replace(/\/\.dmux\/worktrees\/[^/]+$/, '');
              execSync(`git worktree remove "${mergingPane.worktreePath}" --force`, { stdio: 'pipe', cwd: mainRepoPath });
              execSync(`git branch -d ${mergingPane.slug}`, { stdio: 'pipe', cwd: mainRepoPath });
            } catch {
              // Ignore errors, might already be removed
            }
          }
          closePane(mergingPane);
          setShowMergePane(false);
          setMergingPane(null);
        }}
        onCancel={() => {
          setShowMergePane(false);
          setMergingPane(null);
        }}
      />
    );
  }

  // If showing QR code, render only that
  if (showQRCode && tunnelUrl) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            dmux - Remote Access
          </Text>
        </Box>
        <QRCode url={tunnelUrl} />
        <Box marginTop={1}>
          <Text dimColor>Press ESC to return to pane list</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} width="100%" paddingX={1} borderStyle="round" borderColor="cyan">
        <Text bold color="cyan">
          dmux - {projectName}
        </Text>
      </Box>

      <PanesGrid panes={panes} selectedIndex={selectedIndex} isLoading={isLoading} showNewPaneDialog={showNewPaneDialog} agentStatuses={agentStatuses} />

      {/* Loading dialog */}
      {isLoading && (<LoadingIndicator />)}

      {showNewPaneDialog && !showAgentChoiceDialog && (
        <NewPaneDialog
          value={newPanePrompt}
          onChange={setNewPanePrompt}
          onSubmit={(value) => {
            const promptValue = value;
            const agents = availableAgents;
            if (agents.length === 0) {
              setShowNewPaneDialog(false);
              setNewPanePrompt('');
              createNewPaneHook(promptValue);
            } else if (agents.length === 1) {
              setShowNewPaneDialog(false);
              setNewPanePrompt('');
              createNewPaneHook(promptValue, agents[0]);
            } else {
              setPendingPrompt(promptValue);
              setShowNewPaneDialog(false);
              setNewPanePrompt('');
              setShowAgentChoiceDialog(true);
              setAgentChoice(agentChoice || 'claude');
            }
          }}
        />
      )}

      {showAgentChoiceDialog && (
        <AgentChoiceDialog agentChoice={agentChoice} />
      )}

       {isCreatingPane && (
        <CreatingIndicator message={statusMessage} />
      )}

      {showMergeConfirmation && mergedPane && (
        <MergeConfirmationDialog pane={mergedPane} />
      )}

      {showCloseOptions && closingPane && (
        <CloseOptionsDialog pane={closingPane} selectedIndex={selectedCloseOption} />
      )}

      {showCommandPrompt && (
        <CommandPromptDialog type={showCommandPrompt} value={commandInput} onChange={setCommandInput} />
      )}

      {showFileCopyPrompt && (
        <FileCopyPrompt />
      )}


      {runningCommand && (
        <RunningIndicator />
      )}

      {isUpdating && (
        <UpdatingIndicator />
      )}

      {isCreatingTunnel && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginTop={1}>
          <Text bold color="cyan">Creating tunnel...</Text>
          <Box marginTop={1}>
            <Text dimColor>This may take a few moments...</Text>
          </Box>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      <FooterHelp
        show={!showNewPaneDialog && !showCommandPrompt}
        showRemoteKey={!!server}
        gridInfo={(() => {
          if (!process.env.DEBUG_DMUX) return undefined;
          const cols = Math.max(1, Math.floor(terminalWidth / 37));
          const rows = Math.ceil((panes.length + 1) / cols);
          const pos = getCardGridPosition(selectedIndex);
          return `Grid: ${cols} cols × ${rows} rows | Selected: row ${pos.row}, col ${pos.col} | Terminal: ${terminalWidth}w`;
        })()}
      />

      <Text dimColor>
        v{packageJson.version}
        {updateAvailable && updateInfo && (
          <Text color="yellow"> • Update available: {updateInfo.latestVersion}</Text>
        )}
      </Text>
    </Box>
  );
};

export default DmuxApp;