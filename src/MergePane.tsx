import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { execSync, exec } from 'child_process';
import CleanTextInput from './CleanTextInput.js';
import chalk from 'chalk';

interface MergePaneProps {
  pane: {
    id: string;
    slug: string;
    prompt: string;
    paneId: string;
    worktreePath?: string;
  };
  onComplete: () => void;
  onCancel: () => void;
  mainBranch: string;
}

type MergeStatus =
  | 'checking'
  | 'uncommitted-changes'
  | 'committing'
  | 'switching-branch'
  | 'merging'
  | 'merge-conflict'
  | 'conflict-resolution-prompt'
  | 'resolving-with-agent'
  | 'manual-resolution'
  | 'completing'
  | 'success'
  | 'error';

interface CommandOutput {
  command: string;
  output: string;
  error?: string;
  timestamp: Date;
}

export default function MergePane({ pane, onComplete, onCancel, mainBranch }: MergePaneProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<MergeStatus>('checking');
  const [commandHistory, setCommandHistory] = useState<CommandOutput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [showResolutionPrompt, setShowResolutionPrompt] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [showAgentPromptInput, setShowAgentPromptInput] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitInput, setShowCommitInput] = useState(false);

  const addCommandOutput = (command: string, output: string, error?: string) => {
    setCommandHistory(prev => [...prev, {
      command,
      output,
      error,
      timestamp: new Date()
    }]);
  };

  const runCommand = (command: string, cwd?: string): { success: boolean; output: string; error?: string } => {
    try {
      const output = execSync(command, {
        cwd: cwd || pane.worktreePath,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      addCommandOutput(command, output);
      return { success: true, output };
    } catch (err: any) {
      const errorMsg = err.stderr || err.message;
      addCommandOutput(command, '', errorMsg);
      return { success: false, output: '', error: errorMsg };
    }
  };

  const checkForConflicts = (): boolean => {
    const result = runCommand('git status --porcelain');
    if (result.success) {
      const conflicts = result.output
        .split('\n')
        .filter(line => line.startsWith('UU ') || line.startsWith('AA '))
        .map(line => line.substring(3).trim());

      if (conflicts.length > 0) {
        setConflictFiles(conflicts);
        return true;
      }
    }
    return false;
  };

  const generateCommitMessage = async (): Promise<string> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return `chore: merge ${pane.slug} into ${mainBranch}`;
    }

    try {
      const diff = runCommand('git diff --staged');
      if (!diff.success) {
        return `chore: merge ${pane.slug} into ${mainBranch}`;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [{
            role: 'user',
            content: `Generate a concise, semantic commit message for these changes. Follow conventional commits format (feat:, fix:, chore:, etc). Be specific about what changed:\n\n${diff.output.substring(0, 4000)}`
          }],
          max_tokens: 100,
          temperature: 0.3,
        }),
      });

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content?.trim() || `chore: merge ${pane.slug} into ${mainBranch}`;
    } catch {
      return `chore: merge ${pane.slug} into ${mainBranch}`;
    }
  };

  const performMerge = async () => {
    setStatus('checking');

    // Step 1: Check for uncommitted changes
    const statusResult = runCommand('git status --porcelain');
    if (statusResult.success && statusResult.output.trim()) {
      setStatus('uncommitted-changes');

      // Generate commit message
      setStatus('committing');
      const message = await generateCommitMessage();
      setCommitMessage(message);

      // Stage and commit changes
      runCommand('git add -A');
      const commitResult = runCommand(`git commit -m "${message}"`);
      if (!commitResult.success) {
        setError('Failed to commit changes');
        setStatus('error');
        return;
      }
    }

    // Step 2: Switch to main branch
    setStatus('switching-branch');
    const checkoutResult = runCommand(`git checkout ${mainBranch}`);
    if (!checkoutResult.success) {
      setError(`Failed to switch to ${mainBranch} branch`);
      setStatus('error');
      return;
    }

    // Step 3: Attempt merge
    setStatus('merging');
    const mergeResult = runCommand(`git merge ${pane.slug} --no-ff`);

    if (!mergeResult.success) {
      // Check if it's a merge conflict
      if (mergeResult.error?.includes('Automatic merge failed') || checkForConflicts()) {
        setStatus('merge-conflict');
        setShowResolutionPrompt(true);
        return;
      } else {
        setError('Merge failed: ' + mergeResult.error);
        setStatus('error');
        return;
      }
    }

    // Step 4: Clean up worktree and branch
    setStatus('completing');
    runCommand(`git worktree remove ${pane.worktreePath} --force`);
    runCommand(`git branch -d ${pane.slug}`);

    setStatus('success');
  };

  const handleAgentResolution = () => {
    setShowResolutionPrompt(false);
    setShowAgentPromptInput(true);
  };

  const submitAgentResolution = () => {
    setShowAgentPromptInput(false);
    setStatus('resolving-with-agent');

    // Exit the app and launch agent with conflict resolution prompt
    const fullPrompt = agentPrompt || `Fix the merge conflicts in the following files: ${conflictFiles.join(', ')}. Resolve them appropriately based on the changes from branch ${pane.slug} (${pane.prompt}) and ensure the code remains functional.`;

    // Clear screen and exit
    process.stdout.write('\x1b[2J\x1b[H');

    // Launch Claude to resolve conflicts
    try {
      execSync(`claude "${fullPrompt}" --permission-mode=acceptEdits`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch {
      // Try opencode as fallback
      try {
        execSync(`echo "${fullPrompt}" | opencode`, {
          stdio: 'inherit',
          cwd: process.cwd()
        });
      } catch {}
    }

    exit();
  };

  const handleManualResolution = () => {
    setShowResolutionPrompt(false);
    setStatus('manual-resolution');

    // Show instructions and exit
    process.stdout.write('\x1b[2J\x1b[H');
    console.log(chalk.yellow('\nManual merge conflict resolution required:\n'));
    console.log(chalk.white('Conflicted files:'));
    conflictFiles.forEach(file => console.log(chalk.red(`  - ${file}`)));
    console.log(chalk.white('\nTo resolve manually:'));
    console.log(chalk.gray('1. Edit the conflicted files to resolve merge markers'));
    console.log(chalk.gray('2. Stage the resolved files: git add <files>'));
    console.log(chalk.gray('3. Complete the merge: git commit'));
    console.log(chalk.gray('4. Clean up the worktree manually if needed\n'));

    exit();
  };

  useEffect(() => {
    performMerge();
  }, []);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (showResolutionPrompt && !showAgentPromptInput) {
      if (input === 'a' || input === 'A') {
        handleAgentResolution();
      } else if (input === 'm' || input === 'M') {
        handleManualResolution();
      } else if (input === 'c' || input === 'C') {
        onCancel();
      }
    }

    if (status === 'success') {
      if (input === 'y' || input === 'Y' || key.return) {
        onComplete();
      } else if (input === 'n' || input === 'N') {
        exit();
      }
    }

    if (status === 'error' && key.return) {
      onCancel();
    }
  });

  const getStatusColor = (s: MergeStatus): string => {
    switch(s) {
      case 'error':
      case 'merge-conflict':
        return 'red';
      case 'success':
        return 'green';
      case 'checking':
      case 'committing':
      case 'switching-branch':
      case 'merging':
      case 'completing':
        return 'yellow';
      default:
        return 'white';
    }
  };

  const getStatusText = (s: MergeStatus): string => {
    switch(s) {
      case 'checking': return 'Checking repository status...';
      case 'uncommitted-changes': return 'Found uncommitted changes, committing...';
      case 'committing': return `Committing changes: ${commitMessage}`;
      case 'switching-branch': return `Switching to ${mainBranch} branch...`;
      case 'merging': return `Merging ${pane.slug} into ${mainBranch}...`;
      case 'merge-conflict': return 'Merge conflict detected!';
      case 'conflict-resolution-prompt': return 'Choose conflict resolution method';
      case 'resolving-with-agent': return 'Launching agent to resolve conflicts...';
      case 'manual-resolution': return 'Manual resolution selected';
      case 'completing': return 'Cleaning up worktree and branch...';
      case 'success': return 'Merge completed successfully!';
      case 'error': return `Error: ${error}`;
      default: return '';
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Merging: {pane.slug} → {mainBranch}
        </Text>
      </Box>

      <Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginBottom={1}>
        <Text color={getStatusColor(status)} bold>
          Status: {getStatusText(status)}
        </Text>
      </Box>

      {commandHistory.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" padding={1} marginBottom={1} height={10}>
          <Text dimColor>Command Output:</Text>
          {commandHistory.slice(-5).map((cmd, i) => (
            <Box key={i} flexDirection="column">
              <Text color="blue">$ {cmd.command}</Text>
              {cmd.output && <Text dimColor>{cmd.output.substring(0, 200)}</Text>}
              {cmd.error && <Text color="red">{cmd.error.substring(0, 200)}</Text>}
            </Box>
          ))}
        </Box>
      )}

      {showResolutionPrompt && !showAgentPromptInput && (
        <Box borderStyle="double" borderColor="yellow" flexDirection="column" padding={1}>
          <Text color="yellow" bold>Merge Conflict Resolution Required</Text>
          <Text>Conflicted files:</Text>
          {conflictFiles.map(file => (
            <Text key={file} color="red">  • {file}</Text>
          ))}
          <Text> </Text>
          <Text>Choose resolution method:</Text>
          <Text color="cyan">  (A) Resolve with AI agent</Text>
          <Text color="green">  (M) Resolve manually</Text>
          <Text color="gray">  (C) Cancel merge</Text>
        </Box>
      )}

      {showAgentPromptInput && (
        <Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1}>
          <Text>Enter prompt for agent (or press Enter for default):</Text>
          <CleanTextInput
            value={agentPrompt}
            onChange={setAgentPrompt}
            onSubmit={submitAgentResolution}
            placeholder={`Fix merge conflicts from ${pane.slug} branch`}
          />
        </Box>
      )}

      {status === 'success' && (
        <Box borderStyle="double" borderColor="green" flexDirection="column" padding={1}>
          <Text color="green" bold>✓ Merge completed successfully!</Text>
          <Text>Branch {pane.slug} has been merged into {mainBranch}</Text>
          <Text> </Text>
          <Text>Close the pane "{pane.slug}"? (Y/n)</Text>
        </Box>
      )}

      {status === 'error' && (
        <Box borderStyle="double" borderColor="red" flexDirection="column" padding={1}>
          <Text color="red" bold>✗ Merge failed</Text>
          <Text>{error}</Text>
          <Text> </Text>
          <Text dimColor>Press Enter to return to main menu</Text>
        </Box>
      )}
    </Box>
  );
}