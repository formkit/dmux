import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface DmuxPane {
  id: string;
  slug: string;
  prompt: string;
  paneId: string;
  worktreePath?: string;
}

interface DmuxAppProps {
  dmuxDir: string;
  panesFile: string;
  projectName: string;
  sessionName: string;
}

const DmuxApp: React.FC<DmuxAppProps> = ({ dmuxDir, panesFile, projectName, sessionName }) => {
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
  const { exit } = useApp();

  // Load panes on mount and refresh periodically
  useEffect(() => {
    loadPanes();
    const interval = setInterval(loadPanes, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadPanes = async () => {
    try {
      const content = await fs.readFile(panesFile, 'utf-8');
      const loadedPanes = JSON.parse(content) as DmuxPane[];
      
      // Filter out dead panes
      const activePanes = loadedPanes.filter(pane => {
        try {
          // Get list of all pane IDs
          const paneIds = execSync(`tmux list-panes -F '#{pane_id}'`, { 
            encoding: 'utf-8',
            stdio: 'pipe' 
          }).trim().split('\n');
          
          // Check if our pane ID exists in the list
          return paneIds.includes(pane.paneId);
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

  const generateSlug = async (prompt: string): Promise<string> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!apiKey || !prompt) {
      return `dmux-${Date.now()}`;
    }

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

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const slug = data.choices[0].message.content.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      return slug || `dmux-${Date.now()}`;
    } catch {
      return `dmux-${Date.now()}`;
    }
  };

  const createNewPane = async (prompt: string) => {
    setIsCreatingPane(true);
    setStatusMessage('Generating slug...');
    
    const slug = await generateSlug(prompt);
    
    setStatusMessage('Creating new pane...');
    
    // Get current directory
    const currentDir = process.cwd();
    
    // Create worktree path
    const worktreePath = path.join(currentDir, '..', `${path.basename(currentDir)}-${slug}`);
    
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
    
    // Exit Ink app cleanly before creating tmux pane
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
    
    // Apply smart layout based on pane count
    const newPaneCount = paneCount + 1;
    applySmartLayout(newPaneCount);
    
    // Create git worktree and cd into it
    try {
      execSync(`tmux send-keys -t '${paneInfo}' 'git worktree add "${worktreePath}" -b ${slug}' Enter`, { stdio: 'pipe' });
      execSync(`tmux send-keys -t '${paneInfo}' 'cd "${worktreePath}"' Enter`, { stdio: 'pipe' });
    } catch {
      // Continue in current directory if worktree fails
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
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      return 'chore: merge worktree changes';
    }

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

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const message = data.choices[0].message.content.trim();
      return message || 'chore: merge worktree changes';
    } catch {
      return 'chore: merge worktree changes';
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

  useInput((input: string, key: any) => {
    if (isCreatingPane) {
      // Disable input while creating pane
      return;
    }
    
    if (showNewPaneDialog) {
      if (key.escape) {
        setShowNewPaneDialog(false);
        setNewPanePrompt('');
      } else if (key.return) {
        createNewPane(newPanePrompt);
        setShowNewPaneDialog(false);
        setNewPanePrompt('');
      }
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
        handleCloseOption(selectedCloseOption, closingPane);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(panes.length, selectedIndex + 1));
    } else if (input === 'q') {
      exit();
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

      {panes.map((pane, index) => (
        <Box
          key={pane.id}
          paddingX={1}
          borderStyle="single"
          borderColor={selectedIndex === index ? 'cyan' : 'gray'}
          marginBottom={1}
        >
          <Box flexDirection="column">
            <Box>
              <Text color={selectedIndex === index ? 'cyan' : 'white'} bold>
                {pane.slug}
              </Text>
              {pane.worktreePath && (
                <Text color="gray"> (worktree)</Text>
              )}
            </Box>
            <Text color="gray" dimColor>
              {pane.prompt}
            </Text>
          </Box>
        </Box>
      ))}

      <Box
        paddingX={1}
        borderStyle="single"
        borderColor={selectedIndex === panes.length ? 'green' : 'gray'}
        marginBottom={1}
      >
        <Text color={selectedIndex === panes.length ? 'green' : 'white'}>
          + New dmux pane
        </Text>
      </Box>

      {showNewPaneDialog && (
        <Box borderStyle="double" borderColor="cyan" paddingX={1}>
          <Box flexDirection="column">
            <Text>Enter initial Claude prompt (ESC to cancel):</Text>
            <TextInput
              value={newPanePrompt}
              onChange={setNewPanePrompt}
              placeholder="Optional prompt..."
            />
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

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Commands: [j]ump to pane • [x] close • [m]erge worktree • [n]ew pane • [q]uit
        </Text>
        <Text dimColor>
          Use ↑↓ arrows to navigate, Enter to select
        </Text>
      </Box>
    </Box>
  );
};

export default DmuxApp;