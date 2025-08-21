import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SimpleEnhancedInput from './SimpleEnhancedInput.js';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

interface DmuxPane {
  id: string;
  slug: string;
  prompt: string;
  paneId: string;
  worktreePath?: string;
  testWindowId?: string;  // Background window for tests
  testStatus?: 'running' | 'passed' | 'failed';
  testOutput?: string;
  devWindowId?: string;   // Background window for dev server
  devStatus?: 'running' | 'stopped';
  devUrl?: string;        // Detected dev server URL
}

interface ProjectSettings {
  testCommand?: string;
  devCommand?: string;
}

interface DmuxAppProps {
  dmuxDir: string;
  panesFile: string;
  projectName: string;
  sessionName: string;
  projectRoot?: string;
  settingsFile: string;
}

const DmuxApp: React.FC<DmuxAppProps> = ({ dmuxDir, panesFile, projectName, sessionName, settingsFile }) => {
  const [panes, setPanes] = useState<DmuxPane[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showNewPaneDialog, setShowNewPaneDialog] = useState(false);
  const [newPanePrompt, setNewPanePrompt] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showMergeConfirmation, setShowMergeConfirmation] = useState(false);
  const [mergedPane, setMergedPane] = useState<DmuxPane | null>(null);
  const [showCloseOptions, setShowCloseOptions] = useState(false);
  const [selectedCloseOption, setSelectedCloseOption] = useState(0);
  const [closingPane, setClosingPane] = useState<DmuxPane | null>(null);
  const [isCreatingPane, setIsCreatingPane] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({});
  const [showCommandPrompt, setShowCommandPrompt] = useState<'test' | 'dev' | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiChangeRequest, setAIChangeRequest] = useState('');
  const [generatingCommand, setGeneratingCommand] = useState(false);
  const [runningCommand, setRunningCommand] = useState(false);
  const { exit } = useApp();

  // Load panes and settings on mount and refresh periodically
  useEffect(() => {
    loadPanes();
    loadSettings();
    const interval = setInterval(loadPanes, 2000);
    
    // Add cleanup handlers for process termination
    const handleTermination = () => {
      // Clear screen before exit
      process.stdout.write('\x1b[2J\x1b[H');
      process.stdout.write('\x1b[3J');
      try {
        execSync('tmux clear-history', { stdio: 'pipe' });
      } catch {}
      process.exit(0);
    };
    
    process.on('SIGINT', handleTermination);
    process.on('SIGTERM', handleTermination);
    
    return () => {
      clearInterval(interval);
      process.removeListener('SIGINT', handleTermination);
      process.removeListener('SIGTERM', handleTermination);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const content = await fs.readFile(settingsFile, 'utf-8');
      const settings = JSON.parse(content) as ProjectSettings;
      setProjectSettings(settings);
    } catch {
      // Settings file doesn't exist yet, that's ok
      setProjectSettings({});
    }
  };

  const saveSettings = async (settings: ProjectSettings) => {
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
    setProjectSettings(settings);
  };

  const loadPanes = async () => {
    try {
      const content = await fs.readFile(panesFile, 'utf-8');
      const loadedPanes = JSON.parse(content) as DmuxPane[];
      
      // Filter out dead panes and update titles for active ones
      const activePanes = loadedPanes.filter(pane => {
        try {
          // Get list of all pane IDs
          const paneIds = execSync(`tmux list-panes -F '#{pane_id}'`, { 
            encoding: 'utf-8',
            stdio: 'pipe' 
          }).trim().split('\n');
          
          // Check if our pane ID exists in the list
          if (paneIds.includes(pane.paneId)) {
            // Update pane title while we're at it
            const paneTitle = pane.prompt ? pane.prompt.substring(0, 30) : pane.slug;
            try {
              execSync(`tmux select-pane -t '${pane.paneId}' -T "${paneTitle}"`, { stdio: 'pipe' });
            } catch {
              // Ignore if setting title fails
            }
            return true;
          }
          return false;
        } catch {
          return false;
        }
      });
      
      setPanes(activePanes);
      
      // Save cleaned list
      if (activePanes.length !== loadedPanes.length) {
        await fs.writeFile(panesFile, JSON.stringify(activePanes, null, 2));
      }
    } catch {
      setPanes([]);
    }
  };

  const savePanes = async (newPanes: DmuxPane[]) => {
    await fs.writeFile(panesFile, JSON.stringify(newPanes, null, 2));
    setPanes(newPanes);
  };

  const applySmartLayout = (paneCount: number) => {
    try {
      // Progressive layout strategy based on pane count
      if (paneCount <= 2) {
        // 2 panes: side by side
        execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
      } else if (paneCount === 3) {
        // 3 panes: primary top, two bottom
        execSync('tmux select-layout main-horizontal', { stdio: 'pipe' });
      } else if (paneCount === 4) {
        // 4 panes: 2x2 grid
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      } else if (paneCount === 5) {
        // 5 panes: 2 top, 3 bottom
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
        // Custom adjustment for better 2-over-3 layout
        try {
          execSync('tmux resize-pane -t 0 -y 50%', { stdio: 'pipe' });
        } catch {}
      } else if (paneCount === 6) {
        // 6 panes: 3x2 grid
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      } else if (paneCount <= 9) {
        // 7-9 panes: 3x3 grid
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      } else if (paneCount <= 12) {
        // 10-12 panes: 3x4 grid
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      } else if (paneCount <= 16) {
        // 13-16 panes: 4x4 grid
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      } else {
        // More than 16: use tiled for best automatic arrangement
        execSync('tmux select-layout tiled', { stdio: 'pipe' });
      }
      
      // Refresh client to ensure layout is applied
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch (error) {
      // Fallback to even-horizontal if custom layout fails
      try {
        execSync('tmux select-layout even-horizontal', { stdio: 'pipe' });
      } catch {}
    }
  };

  const findClaudeCommand = async (): Promise<string | null> => {
    // Strategy 1: Try to execute claude directly (in case it's in PATH)
    try {
      execSync('claude --version', { stdio: 'pipe' });
      return 'claude';
    } catch {}

    // Strategy 2: Check common installation paths
    const commonPaths = [
      `${process.env.HOME}/.claude/local/claude`,
      `${process.env.HOME}/.local/bin/claude`,
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      '/usr/bin/claude',
      `${process.env.HOME}/bin/claude`,
    ];

    for (const path of commonPaths) {
      try {
        await fs.access(path);
        // Verify it's executable
        execSync(`${path} --version`, { stdio: 'pipe' });
        return path;
      } catch {}
    }

    // Strategy 3: Try to find claude using which in a shell with aliases
    try {
      const userShell = process.env.SHELL || '/bin/bash';
      const result = execSync(
        `${userShell} -i -c "which claude 2>/dev/null"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      if (result) {
        // Verify it works
        execSync(`${result} --version`, { stdio: 'pipe' });
        return result;
      }
    } catch {}

    // Strategy 4: Try to resolve alias
    try {
      const userShell = process.env.SHELL || '/bin/bash';
      const result = execSync(
        `${userShell} -i -c "type -p claude 2>/dev/null || alias claude 2>/dev/null | sed -n 's/.*=\\(.*\\)/\\1/p' | tr -d \"'\""`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      if (result) {
        // Clean up the result (remove quotes, etc)
        const cleanPath = result.replace(/^['"]|['"]$/g, '').replace(/^claude=/, '');
        // Verify it works
        execSync(`${cleanPath} --version`, { stdio: 'pipe' });
        return cleanPath;
      }
    } catch {}

    return null;
  };

  const callClaudeCode = async (prompt: string): Promise<string | null> => {
    try {
      // Use a simpler approach: pipe the prompt via stdin and capture output
      const result = execSync(
        `echo "${prompt.replace(/"/g, '\\"')}" | claude --no-interactive --max-turns 1 2>/dev/null | head -n 5`,
        { 
          encoding: 'utf-8', 
          stdio: 'pipe',
          timeout: 5000 // 5 second timeout
        }
      );
      
      // Extract just the content (first few lines should have the response)
      const lines = result.trim().split('\n');
      const response = lines.join(' ').trim();
      return response || null;
    } catch (error) {
      // Claude not available or error occurred
      return null;
    }
  };

  const generateSlug = async (prompt: string): Promise<string> => {
    if (!prompt) {
      return `dmux-${Date.now()}`;
    }

    // Try OpenRouter first if API key is available
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'user',
                content: `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${prompt}"`
              }
            ],
            max_tokens: 10,
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json() as any;
          const slug = data.choices[0].message.content.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (slug) return slug;
        }
      } catch {
        // Fall through to Claude Code
      }
    }

    // Try Claude Code as fallback
    const claudeResponse = await callClaudeCode(
      `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${prompt}"`
    );
    
    if (claudeResponse) {
      const slug = claudeResponse.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (slug) return slug;
    }

    // Final fallback
    return `dmux-${Date.now()}`;
  };

  const createNewPane = async (prompt: string) => {
    setIsCreatingPane(true);
    setStatusMessage('Generating slug...');
    
    const slug = await generateSlug(prompt);
    
    setStatusMessage('Creating new pane...');
    
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
    
    // Create worktree path relative to project root
    const worktreePath = path.join(path.dirname(projectRoot), `${path.basename(projectRoot)}-${slug}`);
    
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
    
    // Exit Ink app cleanly before creating tmux pane (no cleanup needed here as we're re-launching)
    exit();
    
    // Wait for exit to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 4. Force tmux to refresh the display
    try {
      execSync('tmux refresh-client', { stdio: 'pipe' });
    } catch {}
    
    // Get current pane count to determine layout
    const paneCount = parseInt(
      execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim()
    );
    
    // Create new pane
    const paneInfo = execSync(
      `tmux split-window -h -P -F '#{pane_id}'`,
      { encoding: 'utf-8' }
    ).trim();
    
    // Wait for pane creation to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Set pane title based on prompt or slug
    const paneTitle = prompt ? prompt.substring(0, 30) : slug;
    try {
      execSync(`tmux select-pane -t '${paneInfo}' -T "${paneTitle}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Apply smart layout based on pane count
    const newPaneCount = paneCount + 1;
    applySmartLayout(newPaneCount);
    
    // Create git worktree and cd into it
    try {
      // Send the git worktree command
      execSync(`tmux send-keys -t '${paneInfo}' 'git worktree add "${worktreePath}" -b ${slug} && cd "${worktreePath}"' Enter`, { stdio: 'pipe' });
      
      // Wait for worktree creation to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      // Log error but continue
      setStatusMessage(`Warning: Could not create worktree: ${error}`);
    }
    
    // Prepare the Claude command
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
    
    // Send command to new pane
    const escapedCmd = claudeCmd.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
    execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
    
    // Monitor for Claude Code trust prompt and auto-respond
    const autoApproveTrust = async () => {
      // Give Claude time to start and potentially show the trust prompt
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        // Capture the pane content to check for trust prompt
        const paneContent = execSync(
          `tmux capture-pane -t '${paneInfo}' -p`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        
        // Check for various versions of the trust prompt
        const trustPromptPatterns = [
          /Do you trust the files in this folder\?/i,
          /Trust the files in this workspace\?/i,
          /Do you trust the authors of the files/i,
          /Do you want to trust this workspace\?/i,
          /trust.*files.*folder/i,
          /trust.*workspace/i
        ];
        
        const hasTrustPrompt = trustPromptPatterns.some(pattern => 
          pattern.test(paneContent)
        );
        
        if (hasTrustPrompt) {
          // Auto-respond with Enter (yes) to the trust prompt
          execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
          
          // Optionally wait a bit more and check if we need to send the command again
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Check if Claude is now ready (no longer showing trust prompt)
          const updatedContent = execSync(
            `tmux capture-pane -t '${paneInfo}' -p`,
            { encoding: 'utf-8', stdio: 'pipe' }
          );
          
          // If the trust prompt is gone but Claude hasn't started processing the prompt,
          // we might need to resend the command
          if (!trustPromptPatterns.some(p => p.test(updatedContent)) && 
              !updatedContent.includes(prompt.substring(0, 20))) {
            // Claude might need the command again after trust approval
            // This handles cases where the trust dialog cleared the initial command
            if (prompt && prompt.trim()) {
              execSync(`tmux send-keys -t '${paneInfo}' '${escapedCmd}'`, { stdio: 'pipe' });
              execSync(`tmux send-keys -t '${paneInfo}' Enter`, { stdio: 'pipe' });
            }
          }
        }
      } catch (error) {
        // Ignore errors in auto-approval, it's a best-effort feature
      }
    };
    
    // Start monitoring for trust prompt in background
    autoApproveTrust();
    
    // Keep focus on the new pane
    execSync(`tmux select-pane -t '${paneInfo}'`, { stdio: 'pipe' });
    
    // Save pane info
    const newPane: DmuxPane = {
      id: `dmux-${Date.now()}`,
      slug,
      prompt: prompt ? (prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')) : 'No initial prompt',
      paneId: paneInfo,
      worktreePath
    };
    
    const updatedPanes = [...panes, newPane];
    await fs.writeFile(panesFile, JSON.stringify(updatedPanes, null, 2));
    
    // Switch back to the original pane (where dmux was running)
    execSync(`tmux select-pane -t '${originalPaneId}'`, { stdio: 'pipe' });
    
    // Re-set the title for the dmux pane
    try {
      execSync(`tmux select-pane -t '${originalPaneId}' -T "dmux-${projectName}"`, { stdio: 'pipe' });
    } catch {
      // Ignore if setting title fails
    }
    
    // Small delay to ensure pane is fully established before re-launching
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Re-launch dmux in the original pane
    execSync(`tmux send-keys -t '${originalPaneId}' 'dmux' Enter`, { stdio: 'pipe' });
  };

  const jumpToPane = (paneId: string) => {
    try {
      execSync(`tmux select-pane -t '${paneId}'`, { stdio: 'pipe' });
      setStatusMessage('Jumped to pane');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch {
      setStatusMessage('Failed to jump - pane may be closed');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const closePane = async (pane: DmuxPane) => {
    try {
      // Kill associated test/dev windows if they exist
      if (pane.testWindowId) {
        try {
          execSync(`tmux kill-window -t '${pane.testWindowId}'`, { stdio: 'pipe' });
        } catch {}
      }
      if (pane.devWindowId) {
        try {
          execSync(`tmux kill-window -t '${pane.devWindowId}'`, { stdio: 'pipe' });
        } catch {}
      }
      
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
      
      // 4. Force tmux to refresh the display
      try {
        execSync('tmux refresh-client', { stdio: 'pipe' });
      } catch {}
      
      // Small delay to let clearing complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Kill the tmux pane
      execSync(`tmux kill-pane -t '${pane.paneId}'`, { stdio: 'pipe' });
      
      // Get current pane count to determine layout
      const paneCount = parseInt(
        execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim()
      );
      
      // Apply smart layout after pane removal
      if (paneCount > 1) {
        applySmartLayout(paneCount);
      }
      
      // Remove from list
      const updatedPanes = panes.filter(p => p.id !== pane.id);
      await savePanes(updatedPanes);
      
      setStatusMessage(`Closed pane: ${pane.slug}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to close pane');
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const mergeAndPrune = async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree to merge');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    try {
      setStatusMessage('Checking worktree status...');
      
      // Get current branch
      const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      
      // Check for uncommitted changes in the worktree
      const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });
      
      if (statusOutput.trim()) {
        setStatusMessage('Generating commit message...');
        
        // Get the diff for uncommitted changes
        const diffOutput = execSync(`git -C "${pane.worktreePath}" diff HEAD`, { encoding: 'utf-8' });
        const statusDetails = execSync(`git -C "${pane.worktreePath}" status`, { encoding: 'utf-8' });
        
        // Generate commit message using LLM
        const commitMessage = await generateCommitMessage(`${statusDetails}\n\n${diffOutput}`);
        
        setStatusMessage('Committing changes...');
        
        // Stage all changes and commit with generated message
        execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
        
        // Escape the commit message for shell
        const escapedMessage = commitMessage.replace(/'/g, "'\\''");
        execSync(`git -C "${pane.worktreePath}" commit -m '${escapedMessage}'`, { stdio: 'pipe' });
      }
      
      setStatusMessage('Merging into main...');
      
      // Merge the worktree branch
      execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
      
      // Remove worktree
      execSync(`git worktree remove "${pane.worktreePath}"`, { stdio: 'pipe' });
      
      // Delete branch
      execSync(`git branch -d ${pane.slug}`, { stdio: 'pipe' });
      
      // Close the pane (includes clearing)
      await closePane(pane);
      
      setStatusMessage(`Merged ${pane.slug} into ${mainBranch} and closed pane`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to merge - check git status');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const deleteUnsavedChanges = async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      // No worktree, just close the pane (includes clearing)
      await closePane(pane);
      return;
    }

    try {
      setStatusMessage('Removing worktree with unsaved changes...');
      
      // Force remove worktree (discards uncommitted changes)
      execSync(`git worktree remove --force "${pane.worktreePath}"`, { stdio: 'pipe' });
      
      // Delete branch
      try {
        execSync(`git branch -D ${pane.slug}`, { stdio: 'pipe' });
      } catch {
        // Branch might not exist or have commits, that's ok
      }
      
      // Close the pane (includes clearing)
      await closePane(pane);
      
      setStatusMessage(`Deleted worktree ${pane.slug} and closed pane`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Failed to delete worktree');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleCloseOption = async (option: number, pane: DmuxPane) => {
    setShowCloseOptions(false);
    setClosingPane(null);
    setSelectedCloseOption(0);

    switch (option) {
      case 0: // Merge & Prune
        await mergeAndPrune(pane);
        break;
      case 1: // Merge Only
        await mergeWorktree(pane);
        break;
      case 2: // Delete Unsaved Changes
        await deleteUnsavedChanges(pane);
        break;
      case 3: // Just Close
        await closePane(pane);
        break;
    }
  };

  const generateCommitMessage = async (changes: string): Promise<string> => {
    // Try OpenRouter first if API key is available
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a git commit message generator. Generate semantic commit messages following conventional commits format (feat:, fix:, docs:, style:, refactor:, test:, chore:). Be concise and specific.'
              },
              {
                role: 'user',
                content: `Generate a semantic commit message for these changes:\n\n${changes.substring(0, 3000)}`
              }
            ],
            max_tokens: 100,
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json() as any;
          const message = data.choices[0].message.content.trim();
          if (message) return message;
        }
      } catch {
        // Fall through to Claude Code
      }
    }

    // Try Claude Code as fallback
    const systemPrompt = 'You are a git commit message generator. Generate semantic commit messages following conventional commits format (feat:, fix:, docs:, style:, refactor:, test:, chore:). Be concise and specific.';
    const userPrompt = `${systemPrompt}\n\nGenerate a semantic commit message for these changes:\n\n${changes.substring(0, 3000)}`;
    
    const claudeResponse = await callClaudeCode(userPrompt);
    if (claudeResponse) {
      const message = claudeResponse.trim();
      if (message) return message;
    }

    // Final fallback
    return 'chore: merge worktree changes';
  };

  const generateCommand = async (type: 'test' | 'dev', changeRequest?: string): Promise<string | null> => {
    setGeneratingCommand(true);
    setStatusMessage(`Generating ${type} command with AI...`);
    
    try {
      // Find claude command
      const claudeCmd = await findClaudeCommand();
      if (!claudeCmd) {
        throw new Error('Claude Code not found. Please ensure Claude Code is installed and accessible');
      }

      // Get project root
      const projectRoot = execSync('git rev-parse --show-toplevel', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      
      // Pre-fetch directory listings
      setStatusMessage('Analyzing project structure...');
      
      // Get main directory listing
      const mainFiles = execSync(`ls -la "${projectRoot}"`, { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // Get worktree listing (simulate what it would look like)
      // For now we'll use main, but in reality worktrees start with the same files
      const worktreeFiles = mainFiles;
      
      // Check for package.json to understand the project type
      let packageJsonContent = '';
      try {
        packageJsonContent = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
      } catch {}
      
      let requestedFile = '';
      let maxAttempts = 2; // Allow one file request, then must generate command
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const isLastAttempt = attempt === maxAttempts - 1;
        
        // Build the prompt
        let prompt = `You are generating a ${type === 'test' ? 'test' : 'development server'} command for a git worktree.

CRITICAL CONTEXT:
- Main project directory: ${projectRoot}
- Worktrees are siblings: ${path.dirname(projectRoot)}/{project-name}-{branch}
- Command runs INSIDE the worktree (not main)
- Files like .env, .wrangler, node_modules are NOT shared between worktrees

Files in MAIN directory:
${mainFiles}

Files in WORKTREE (initially same as main):
${worktreeFiles}

${packageJsonContent ? `package.json contents:\n${packageJsonContent.substring(0, 3000)}\n` : ''}

${requestedFile}

${changeRequest ? `User's requested change: ${changeRequest}\n` : ''}

Your task: Generate a command to ${type === 'test' ? 'run tests' : 'start a dev server'} in the worktree.

Consider:
1. Copy needed files from main (e.g., cp ../${path.basename(projectRoot)}/.env .)
2. Install dependencies (npm/pnpm/yarn install)
3. Build if needed
4. Run the ${type} command

${isLastAttempt ? 'YOU MUST PROVIDE THE FINAL COMMAND NOW. No more file requests allowed.' : 'You can request ONE file to read, then you must provide the command.'}

Respond with ONLY a JSON object:

${!isLastAttempt ? `To read ONE file (only one chance):
{
  "type": "cat",
  "path": "path/to/file"
}

OR ` : ''}To provide the final command:
{
  "type": "command",
  "command": "cp ../${path.basename(projectRoot)}/.env . && npm install && npm run ${type}",
  "description": "Copy env, install deps, run ${type}"
}`;

        // Write prompt to a temporary file
        const tmpFile = `/tmp/dmux-prompt-${Date.now()}.txt`;
        await fs.writeFile(tmpFile, prompt);
        
        // Use Claude to generate the response
        const result = execSync(
          `${claudeCmd} -p "$(cat ${tmpFile})" --output-format json`,
          { 
            encoding: 'utf-8',
            stdio: 'pipe',
            maxBuffer: 1024 * 1024 * 10
          }
        );
        
        // Clean up temp file
        try {
          await fs.unlink(tmpFile);
        } catch {}
        
        // Parse the response
        let response: any;
        try {
          const wrapper = JSON.parse(result);
          let actualResult = wrapper.result || wrapper;
          
          if (typeof actualResult === 'string') {
            actualResult = actualResult.trim();
            
            // Extract JSON from the response
            const jsonMatch = actualResult.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              let jsonStr = jsonMatch[0];
              
              // Clean up markdown code blocks if present
              if (actualResult.includes('```')) {
                const codeBlockMatch = actualResult.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                  jsonStr = codeBlockMatch[1].trim();
                }
              }
              
              actualResult = JSON.parse(jsonStr);
            } else {
              throw new Error('No JSON object found in response');
            }
          }
          
          response = actualResult;
        } catch (parseError) {
          console.error('Failed to parse Claude response:', result);
          throw new Error(`Failed to parse AI response: ${parseError}`);
        }
        
        // Handle the response
        if (response.type === 'cat' && !isLastAttempt) {
          // Read the requested file
          const targetPath = path.join(projectRoot, response.path);
          try {
            const content = await fs.readFile(targetPath, 'utf-8');
            const truncated = content.length > 4000 
              ? content.substring(0, 4000) + '\n... [truncated]'
              : content;
            requestedFile = `\nContents of ${response.path}:\n${truncated}\n`;
          } catch (err) {
            requestedFile = `\nError reading ${response.path}: File not found\n`;
          }
          // Continue to next iteration to get the command
        } else if (response.type === 'command') {
          // Got the command!
          setGeneratingCommand(false);
          setStatusMessage('');
          return response.command;
        } else if (isLastAttempt) {
          // Last attempt must provide a command
          throw new Error('AI did not provide a command on final attempt');
        }
      }
      
      throw new Error('Failed to generate command after maximum attempts');
    } catch (error) {
      setGeneratingCommand(false);
      setStatusMessage(`Failed to generate command: ${error}`);
      setTimeout(() => setStatusMessage(''), 3000);
      return null;
    }
  };

  const runCommand = async (type: 'test' | 'dev', pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree path for this pane');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    const command = type === 'test' ? projectSettings.testCommand : projectSettings.devCommand;
    
    if (!command) {
      // No command configured, prompt user
      setShowCommandPrompt(type);
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
  
  const monitorTestOutput = async (paneId: string, logFile: string) => {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      
      // Look for common test result patterns
      let status: 'passed' | 'failed' | 'running' = 'running';
      if (content.match(/(?:tests?|specs?) (?:passed|✓|succeeded)/i) || 
          content.match(/\b0 fail(?:ing|ed|ures?)\b/i)) {
        status = 'passed';
      } else if (content.match(/(?:tests?|specs?) (?:failed|✗|✖)/i) || 
                 content.match(/\d+ fail(?:ing|ed|ures?)/i) ||
                 content.match(/error:/i)) {
        status = 'failed';
      }
      
      // Check if process is still running
      const pane = panes.find(p => p.id === paneId);
      if (pane?.testWindowId) {
        try {
          execSync(`tmux list-windows -F '#{window_id}' | grep -q '${pane.testWindowId}'`, { stdio: 'pipe' });
          // Window still exists, check if command is done
          const paneOutput = execSync(`tmux capture-pane -t '${pane.testWindowId}' -p | tail -5`, { encoding: 'utf-8' });
          if (paneOutput.includes('$') || paneOutput.includes('#')) {
            // Command prompt returned, test is done
            if (status === 'running') status = 'passed'; // Assume success if no errors found
          }
        } catch {
          // Window doesn't exist or command failed
          if (status === 'running') status = 'failed';
        }
      }
      
      // Update pane status
      const updatedPanes = panes.map(p => 
        p.id === paneId 
          ? { ...p, testStatus: status, testOutput: content.slice(-5000) } // Keep last 5000 chars
          : p
      );
      await savePanes(updatedPanes);
      
      // Continue monitoring if still running
      if (status === 'running') {
        setTimeout(() => monitorTestOutput(paneId, logFile), 2000);
      }
    } catch {}
  };
  
  const monitorDevOutput = async (paneId: string, logFile: string) => {
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      
      // Look for dev server URLs
      const urlMatch = content.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/i) ||
                       content.match(/Local:\s+(https?:\/\/[^\s]+)/i) ||
                       content.match(/listening on port (\d+)/i);
      
      let devUrl = '';
      if (urlMatch) {
        if (urlMatch[0].startsWith('http')) {
          devUrl = urlMatch[0];
        } else if (urlMatch[1]) {
          // If we just found a port number
          devUrl = `http://localhost:${urlMatch[1]}`;
        }
      }
      
      // Check if process is still running
      const pane = panes.find(p => p.id === paneId);
      let status: 'running' | 'stopped' = 'running';
      if (pane?.devWindowId) {
        try {
          execSync(`tmux list-windows -F '#{window_id}' | grep -q '${pane.devWindowId}'`, { stdio: 'pipe' });
        } catch {
          // Window doesn't exist
          status = 'stopped';
        }
      }
      
      // Update pane status
      const updatedPanes = panes.map(p => 
        p.id === paneId 
          ? { ...p, devStatus: status, devUrl: devUrl || p.devUrl }
          : p
      );
      await savePanes(updatedPanes);
      
      // Continue monitoring if still running
      if (status === 'running') {
        setTimeout(() => monitorDevOutput(paneId, logFile), 2000);
      }
    } catch {}
  };

  const attachBackgroundWindow = async (pane: DmuxPane, type: 'test' | 'dev') => {
    const windowId = type === 'test' ? pane.testWindowId : pane.devWindowId;
    if (!windowId) {
      setStatusMessage(`No ${type} window to attach`);
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }
    
    try {
      // Join the window to current window as a pane
      execSync(`tmux join-pane -h -s '${windowId}'`, { stdio: 'pipe' });
      
      // Apply smart layout
      const paneCount = parseInt(
        execSync('tmux list-panes | wc -l', { encoding: 'utf-8' }).trim()
      );
      applySmartLayout(paneCount);
      
      // Focus on the newly attached pane
      execSync(`tmux select-pane -t '{last}'`, { stdio: 'pipe' });
      
      setStatusMessage(`Attached ${type} window`);
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (error) {
      setStatusMessage(`Failed to attach ${type} window`);
      setTimeout(() => setStatusMessage(''), 2000);
    }
  };

  const mergeWorktree = async (pane: DmuxPane) => {
    if (!pane.worktreePath) {
      setStatusMessage('No worktree to merge');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }

    try {
      setStatusMessage('Checking worktree status...');
      
      // Get current branch
      const mainBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
      
      // Check for uncommitted changes in the worktree
      const statusOutput = execSync(`git -C "${pane.worktreePath}" status --porcelain`, { encoding: 'utf-8' });
      
      if (statusOutput.trim()) {
        setStatusMessage('Staging changes...');
        
        // Stage all changes first (including untracked files)
        execSync(`git -C "${pane.worktreePath}" add -A`, { stdio: 'pipe' });
        
        setStatusMessage('Generating commit message...');
        
        // Get the diff of staged changes (after adding files)
        const diffOutput = execSync(`git -C "${pane.worktreePath}" diff --cached`, { encoding: 'utf-8' });
        const statusDetails = execSync(`git -C "${pane.worktreePath}" status`, { encoding: 'utf-8' });
        
        // Generate commit message using LLM
        const commitMessage = await generateCommitMessage(`${statusDetails}\n\n${diffOutput}`);
        
        setStatusMessage('Committing changes...');
        
        // Escape the commit message for shell
        const escapedMessage = commitMessage.replace(/'/g, "'\\''");
        execSync(`git -C "${pane.worktreePath}" commit -m '${escapedMessage}'`, { stdio: 'pipe' });
      }
      
      setStatusMessage('Merging into main...');
      
      // Merge the worktree branch
      execSync(`git merge ${pane.slug}`, { stdio: 'pipe' });
      
      // Remove worktree
      execSync(`git worktree remove "${pane.worktreePath}"`, { stdio: 'pipe' });
      
      // Delete branch
      execSync(`git branch -d ${pane.slug}`, { stdio: 'pipe' });
      
      setStatusMessage(`Merged ${pane.slug} into ${mainBranch}`);
      setTimeout(() => setStatusMessage(''), 3000);
      
      // Show confirmation dialog to close the pane
      setMergedPane(pane);
      setShowMergeConfirmation(true);
    } catch (error) {
      setStatusMessage('Failed to merge - check git status');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

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
    
    // Exit the app
    exit();
  };

  useInput(async (input: string, key: any) => {
    if (isCreatingPane || generatingCommand || runningCommand) {
      // Disable input while performing operations
      return;
    }
    
    if (showCommandPrompt) {
      if (key.escape) {
        setShowCommandPrompt(null);
        setCommandInput('');
        setShowAIPrompt(false);
        setAIChangeRequest('');
      } else if (key.return && !showAIPrompt) {
        if (commandInput.trim() === '') {
          // User wants AI to generate
          const generated = await generateCommand(showCommandPrompt);
          if (generated) {
            setCommandInput(generated);
            setShowAIPrompt(true);
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
            await runCommand(showCommandPrompt, selectedPane);
          }
          setShowCommandPrompt(null);
          setCommandInput('');
          setShowAIPrompt(false);
        }
      } else if (key.return && showAIPrompt) {
        if (aiChangeRequest.trim() === '') {
          // User accepts AI generated command
          const newSettings = {
            ...projectSettings,
            [showCommandPrompt === 'test' ? 'testCommand' : 'devCommand']: commandInput.trim()
          };
          await saveSettings(newSettings);
          const selectedPane = panes[selectedIndex];
          if (selectedPane) {
            await runCommand(showCommandPrompt, selectedPane);
          }
          setShowCommandPrompt(null);
          setCommandInput('');
          setShowAIPrompt(false);
          setAIChangeRequest('');
        } else {
          // User wants changes, regenerate
          const generated = await generateCommand(showCommandPrompt, aiChangeRequest);
          if (generated) {
            setCommandInput(generated);
            setAIChangeRequest('');
          }
        }
      }
      return;
    }
    
    if (showNewPaneDialog) {
      // EnhancedTextInput handles its own input events
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
        handleCloseOption(selectedCloseOption, closingPane).catch(error => {
          setStatusMessage('Failed to close pane');
          setTimeout(() => setStatusMessage(''), 2000);
        });
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(panes.length, selectedIndex + 1));
    } else if (input === 'q') {
      cleanExit();
    } else if (input === 'n' || (key.return && selectedIndex === panes.length)) {
      setShowNewPaneDialog(true);
    } else if (input === 'j' && selectedIndex < panes.length) {
      jumpToPane(panes[selectedIndex].paneId);
    } else if (input === 'x' && selectedIndex < panes.length) {
      setClosingPane(panes[selectedIndex]);
      setShowCloseOptions(true);
      setSelectedCloseOption(0);
    } else if (input === 'm' && selectedIndex < panes.length) {
      mergeWorktree(panes[selectedIndex]);
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

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          dmux - {projectName}
        </Text>
      </Box>

      {/* Flex container for pane cards with wrapping */}
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {panes.map((pane, index) => {
          // Determine border color based on status
          let borderColor = 'gray';
          if (selectedIndex === index) {
            borderColor = 'cyan';
          } else if (pane.devStatus === 'running') {
            borderColor = 'green';
          } else if (pane.testStatus === 'running') {
            borderColor = 'yellow';
          } else if (pane.testStatus === 'failed') {
            borderColor = 'red';
          }
          
          return (
            <Box
              key={pane.id}
              paddingX={1}
              borderStyle="single"
              borderColor={borderColor}
              width={35}  // Max width for cards
              flexShrink={0}
            >
              <Box flexDirection="column">
                <Box>
                  <Text color={selectedIndex === index ? 'cyan' : 'white'} bold wrap="truncate">
                    {pane.slug}
                  </Text>
                  {pane.worktreePath && (
                    <Text color="gray"> (wt)</Text>
                  )}
                </Box>
                <Text color="gray" dimColor wrap="truncate">
                  {pane.prompt.substring(0, 30)}
                </Text>
                
                {/* Compact status indicators */}
                {(pane.testStatus || pane.devStatus) && (
                  <Box>
                    {pane.testStatus === 'running' && (
                      <Text color="yellow">⏳ Test</Text>
                    )}
                    {pane.testStatus === 'passed' && (
                      <Text color="green">✓ Test</Text>
                    )}
                    {pane.testStatus === 'failed' && (
                      <Text color="red">✗ Test</Text>
                    )}
                    {pane.devStatus === 'running' && (
                      <Text color="green">
                        ▶ Dev
                        {pane.devUrl && (
                          <Text color="cyan" wrap="truncate"> {pane.devUrl.replace(/https?:\/\//, '').substring(0, 15)}</Text>
                        )}
                      </Text>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}

        {/* New pane button */}
        <Box
          paddingX={1}
          borderStyle="single"
          borderColor={selectedIndex === panes.length ? 'green' : 'gray'}
          width={35}  // Match card width
          flexShrink={0}
        >
          <Text color={selectedIndex === panes.length ? 'green' : 'white'}>
            + New dmux pane
          </Text>
        </Box>
      </Box>

      {showNewPaneDialog && (
        <Box borderStyle="double" borderColor="cyan" paddingX={1}>
          <Box flexDirection="column">
            <Text>Enter initial Claude prompt (ESC to cancel):</Text>
            <Box marginTop={1}>
              <SimpleEnhancedInput
                value={newPanePrompt}
                onChange={setNewPanePrompt}
                placeholder="Optional prompt... (@ to reference files)"
                onSubmit={() => {
                  createNewPane(newPanePrompt);
                  setShowNewPaneDialog(false);
                  setNewPanePrompt('');
                }}
                onCancel={() => {
                  setShowNewPaneDialog(false);
                  setNewPanePrompt('');
                }}
                isActive={showNewPaneDialog}
                workingDirectory={process.cwd()}
              />
            </Box>
          </Box>
        </Box>
      )}

      {isCreatingPane && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
          <Text color="yellow">
            <Text bold>⏳ Creating new pane... </Text>
            {statusMessage}
          </Text>
        </Box>
      )}

      {showMergeConfirmation && mergedPane && (
        <Box borderStyle="double" borderColor="yellow" paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color="yellow" bold>Worktree merged successfully!</Text>
            <Text>Close the pane "{mergedPane.slug}"? (y/n)</Text>
          </Box>
        </Box>
      )}

      {showCloseOptions && closingPane && (
        <Box borderStyle="double" borderColor="red" paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color="red" bold>Close pane "{closingPane.slug}"?</Text>
            <Text dimColor>Select an option (ESC to cancel):</Text>
            <Box flexDirection="column" marginTop={1}>
              <Box>
                <Text color={selectedCloseOption === 0 ? 'cyan' : 'white'}>
                  {selectedCloseOption === 0 ? '▶ ' : '  '}Merge & Prune - Merge worktree to main and close
                </Text>
              </Box>
              <Box>
                <Text color={selectedCloseOption === 1 ? 'cyan' : 'white'}>
                  {selectedCloseOption === 1 ? '▶ ' : '  '}Merge Only - Merge worktree but keep pane open
                </Text>
              </Box>
              <Box>
                <Text color={selectedCloseOption === 2 ? 'cyan' : 'white'}>
                  {selectedCloseOption === 2 ? '▶ ' : '  '}Delete Unsaved - Remove worktree (discard changes)
                </Text>
              </Box>
              <Box>
                <Text color={selectedCloseOption === 3 ? 'cyan' : 'white'}>
                  {selectedCloseOption === 3 ? '▶ ' : '  '}Just Close - Close pane only
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {showCommandPrompt && !showAIPrompt && (
        <Box borderStyle="double" borderColor="magenta" paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color="magenta" bold>
              Configure {showCommandPrompt === 'test' ? 'Test' : 'Dev'} Command
            </Text>
            <Text dimColor>
              Enter command to run {showCommandPrompt === 'test' ? 'tests' : 'dev server'} in worktrees
            </Text>
            <Text dimColor>
              (Press Enter with empty input to generate with AI, ESC to cancel)
            </Text>
            <Box marginTop={1}>
              <TextInput
                value={commandInput}
                onChange={setCommandInput}
                placeholder={showCommandPrompt === 'test' ? 'e.g., npm test, pnpm test' : 'e.g., npm run dev, pnpm dev'}
              />
            </Box>
          </Box>
        </Box>
      )}

      {showCommandPrompt && showAIPrompt && (
        <Box borderStyle="double" borderColor="magenta" paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color="magenta" bold>
              AI Generated {showCommandPrompt === 'test' ? 'Test' : 'Dev'} Command
            </Text>
            <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
              <Text>{commandInput}</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Press Enter to accept, or describe changes needed:
              </Text>
            </Box>
            <Box marginTop={1}>
              <TextInput
                value={aiChangeRequest}
                onChange={setAIChangeRequest}
                placeholder="e.g., 'also copy .env file' or press Enter to accept"
              />
            </Box>
          </Box>
        </Box>
      )}

      {generatingCommand && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
          <Text color="yellow">
            <Text bold>⏳ Generating command with AI...</Text>
          </Text>
        </Box>
      )}

      {runningCommand && (
        <Box borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
          <Text color="blue">
            <Text bold>▶ Running command...</Text>
          </Text>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      {!showNewPaneDialog && !showCommandPrompt && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            Commands: [j]ump • [t]est • [d]ev • [o]pen • [x]close • [m]erge • [n]ew • [q]uit
          </Text>
          <Text dimColor>
            Use ↑↓ arrows to navigate, Enter to select
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>dmux v{packageJson.version}</Text>
      </Box>
    </Box>
  );
};

export default DmuxApp;