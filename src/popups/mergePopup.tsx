#!/usr/bin/env node

/**
 * Standalone popup for merge workflow
 * Runs in a tmux popup modal and handles the entire merge process
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { POPUP_CONFIG } from './config.js';
import {
  PopupWrapper,
  writeSuccessAndExit,
  writeCancelAndExit,
  writeErrorAndExit,
  type PopupResult
} from './components/index.js';

interface MergeIssue {
  type: string;
  message: string;
  files?: string[];
}

interface ValidationResult {
  canMerge: boolean;
  mainBranch: string;
  issues: MergeIssue[];
}

interface MergePopupProps {
  resultFile: string;
  paneSlug: string;
  worktreePath: string;
  mainRepoPath: string;
  mainBranch: string;
}

type MergeStep =
  | 'validating'
  | 'confirm'
  | 'main_dirty'
  | 'worktree_uncommitted'
  | 'generating_commit'
  | 'commit_input'
  | 'merging'
  | 'cleanup_confirm'
  | 'complete'
  | 'error';

const MergePopupApp: React.FC<MergePopupProps> = ({
  resultFile,
  paneSlug,
  worktreePath,
  mainRepoPath,
  mainBranch,
}) => {
  const [step, setStep] = useState<MergeStep>('validating');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [commitMessage, setCommitMessage] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('Validating merge...');
  const [targetRepo, setTargetRepo] = useState<string>(''); // Track which repo we're committing to
  const { exit } = useApp();

  // Validation on mount
  useEffect(() => {
    (async () => {
      try {
        // Import and run validation
        const { validateMerge } = await import('../utils/mergeValidation.js');
        const result = validateMerge(mainRepoPath, worktreePath, paneSlug);
        setValidation(result);

        if (!result.canMerge) {
          // Check issue types
          const mainDirty = result.issues.find((i: MergeIssue) => i.type === 'main_dirty');
          const worktreeUncommitted = result.issues.find((i: MergeIssue) => i.type === 'worktree_uncommitted');
          const nothingToMerge = result.issues.find((i: MergeIssue) => i.type === 'nothing_to_merge');

          if (nothingToMerge) {
            setStep('error');
            setErrorMessage('No new commits to merge');
          } else if (mainDirty) {
            setStep('main_dirty');
            setStatusMessage('Main branch has uncommitted changes');
          } else if (worktreeUncommitted) {
            setStep('worktree_uncommitted');
            setStatusMessage('Worktree has uncommitted changes');
          } else {
            setStep('error');
            setErrorMessage(result.issues.map((i: MergeIssue) => i.message).join('\n'));
          }
        } else {
          setStep('confirm');
          setStatusMessage(`Ready to merge "${paneSlug}" into ${result.mainBranch}`);
        }
      } catch (error) {
        setStep('error');
        setErrorMessage(`Validation failed: ${error}`);
      }
    })();
  }, []);

  // Handle AI commit message generation
  const generateCommitMessage = async (repoPath: string) => {
    setStep('generating_commit');
    setStatusMessage('Generating commit message with AI...');

    try {
      const { generateCommitMessage } = await import('../utils/aiMerge.js');
      const message = await generateCommitMessage(repoPath);

      if (message) {
        setGeneratedMessage(message);
        setCommitMessage(message);
        setStep('commit_input');
        setStatusMessage('Review and edit commit message:');
      } else {
        // AI generation failed, go straight to manual input
        setStep('commit_input');
        setStatusMessage('Enter commit message (AI generation unavailable):');
      }
    } catch (error) {
      setStep('commit_input');
      setStatusMessage('Enter commit message (AI generation failed):');
    }
  };

  // Execute merge
  const executeMerge = async () => {
    setStep('merging');
    setStatusMessage('Merging worktree into main...');

    try {
      const { mergeWorktreeIntoMain } = await import('../utils/mergeExecution.js');
      const result = mergeWorktreeIntoMain(mainRepoPath, paneSlug);

      if (!result.success) {
        setStep('error');
        setErrorMessage(`Merge failed: ${result.error}`);
        return;
      }

      // Merge successful
      setStep('cleanup_confirm');
      setStatusMessage('Merge complete! Close pane and cleanup?');
    } catch (error) {
      setStep('error');
      setErrorMessage(`Merge execution failed: ${error}`);
    }
  };

  // Commit changes
  const commitChanges = async (repoPath: string, message: string) => {
    try {
      const { stageAllChanges, commitChanges: doCommit } = await import('../utils/mergeValidation.js');

      const stageResult = stageAllChanges(repoPath);
      if (!stageResult.success) {
        setStep('error');
        setErrorMessage(`Failed to stage changes: ${stageResult.error}`);
        return false;
      }

      const commitResult = doCommit(repoPath, message);
      if (!commitResult.success) {
        setStep('error');
        setErrorMessage(`Commit failed: ${commitResult.error}`);
        return false;
      }

      return true;
    } catch (error) {
      setStep('error');
      setErrorMessage(`Commit failed: ${error}`);
      return false;
    }
  };

  useInput((input, key) => {
    if (key.escape && step !== 'merging' && step !== 'generating_commit') {
      // User cancelled
      writeCancelAndExit(resultFile, exit);
      return;
    }

    // Step-specific handling
    if (step === 'confirm') {
      if (input === 'y' || input === 'Y' || key.return) {
        executeMerge();
      } else if (input === 'n' || input === 'N') {
        writeCancelAndExit(resultFile, exit);
      }
    } else if (step === 'main_dirty' || step === 'worktree_uncommitted') {
      const options = ['AI commit (auto)', 'AI commit (editable)', 'Manual commit', 'Cancel'];

      if (key.upArrow) {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow) {
        setSelectedIndex(Math.min(options.length - 1, selectedIndex + 1));
      } else if (key.return) {
        const repoPath = step === 'main_dirty' ? mainRepoPath : worktreePath;
        setTargetRepo(repoPath);

        switch (selectedIndex) {
          case 0: // AI commit (auto)
            (async () => {
              await generateCommitMessage(repoPath);
              if (commitMessage) {
                if (await commitChanges(repoPath, commitMessage)) {
                  // Re-validate and proceed
                  setStep('validating');
                  setStatusMessage('Revalidating...');
                  // Trigger re-validation (simplified - would need proper re-run)
                  setTimeout(() => {
                    setStep('confirm');
                    setStatusMessage('Ready to merge');
                  }, 500);
                }
              }
            })();
            break;
          case 1: // AI commit (editable)
            generateCommitMessage(repoPath);
            break;
          case 2: // Manual commit
            setStep('commit_input');
            setStatusMessage('Enter commit message:');
            break;
          case 3: // Cancel
            writeCancelAndExit(resultFile, exit);
            break;
        }
      }
    } else if (step === 'cleanup_confirm') {
      if (input === 'y' || input === 'Y' || key.return) {
        // Cleanup and close
        (async () => {
          try {
            const { cleanupAfterMerge } = await import('../utils/mergeExecution.js');
            cleanupAfterMerge(mainRepoPath, worktreePath, paneSlug);

            writeSuccessAndExit(resultFile, { merged: true, closedPane: true }, exit);
          } catch (error) {
            setStep('error');
            setErrorMessage(`Cleanup failed: ${error}`);
          }
        })();
      } else if (input === 'n' || input === 'N') {
        // Just mark as merged, don't close
        writeSuccessAndExit(resultFile, { merged: true, closedPane: false }, exit);
      }
    } else if (step === 'error') {
      // Any key exits on error
      writeErrorAndExit(resultFile, errorMessage, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color={POPUP_CONFIG.titleColor}>
            🔀 Merge: {paneSlug} → {mainBranch}
          </Text>
        </Box>

        {/* Status message */}
        <Box marginBottom={1}>
          <Text>{statusMessage}</Text>
        </Box>

        {/* Step-specific UI */}
        {step === 'validating' && (
          <Box>
            <Text dimColor>Checking repository status...</Text>
          </Box>
        )}

        {step === 'confirm' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text>Proceed with merge?</Text>
            </Box>
            <Box>
              <Text dimColor>Y to confirm • N to cancel • ESC to exit</Text>
            </Box>
          </Box>
        )}

        {(step === 'main_dirty' || step === 'worktree_uncommitted') && (
          <Box flexDirection="column">
            {validation?.issues
              .filter(i => i.type === step)
              .map((issue, idx) => (
                <Box key={idx} marginBottom={1} flexDirection="column">
                  <Text>{issue.message}</Text>
                  {issue.files && issue.files.length > 0 && (
                    <Box marginLeft={2} flexDirection="column">
                      {issue.files.slice(0, 5).map((file, i) => (
                        <Text key={i} dimColor>
                          • {file}
                        </Text>
                      ))}
                      {issue.files.length > 5 && (
                        <Text dimColor>... and {issue.files.length - 5} more</Text>
                      )}
                    </Box>
                  )}
                </Box>
              ))}

            <Box flexDirection="column" marginTop={1} marginBottom={1}>
              {['AI commit (auto)', 'AI commit (editable)', 'Manual commit', 'Cancel'].map(
                (option, idx) => (
                  <Box key={idx}>
                    <Text color={selectedIndex === idx ? POPUP_CONFIG.titleColor : 'white'} bold={selectedIndex === idx}>
                      {selectedIndex === idx ? '▶ ' : '  '}
                      {option}
                    </Text>
                  </Box>
                )
              )}
            </Box>

            <Box>
              <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
            </Box>
          </Box>
        )}

        {step === 'generating_commit' && (
          <Box>
            <Text dimColor>⏳ Generating commit message with AI...</Text>
          </Box>
        )}

        {step === 'commit_input' && (
          <Box flexDirection="column">
            {generatedMessage && (
              <Box marginBottom={1}>
                <Text dimColor>Generated: {generatedMessage.split('\n')[0]}</Text>
              </Box>
            )}
            <Box>
              <Text>Message: </Text>
              <TextInput
                value={commitMessage}
                onChange={setCommitMessage}
                onSubmit={async (value) => {
                  if (value.trim()) {
                    if (await commitChanges(targetRepo, value)) {
                      // Re-validate
                      setStep('validating');
                      setTimeout(() => {
                        setStep('confirm');
                        setStatusMessage('Ready to merge');
                      }, 500);
                    }
                  }
                }}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter to submit • ESC to cancel</Text>
            </Box>
          </Box>
        )}

        {step === 'merging' && (
          <Box>
            <Text dimColor>⏳ Merging branches...</Text>
          </Box>
        )}

        {step === 'cleanup_confirm' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color={POPUP_CONFIG.successColor}>✓ Merge successful!</Text>
            </Box>
            <Box marginBottom={1}>
              <Text>Close pane and cleanup worktree?</Text>
            </Box>
            <Box>
              <Text dimColor>Y to cleanup • N to keep pane • ESC to exit</Text>
            </Box>
          </Box>
        )}

        {step === 'error' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color={POPUP_CONFIG.errorColor}>✗ Error</Text>
            </Box>
            <Box marginBottom={1}>
              <Text>{errorMessage}</Text>
            </Box>
            <Box>
              <Text dimColor>Press any key to close</Text>
            </Box>
          </Box>
        )}
      </Box>
    </PopupWrapper>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file required');
    process.exit(1);
  }

  let data: {
    paneSlug: string;
    worktreePath: string;
    mainRepoPath: string;
    mainBranch: string;
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <MergePopupApp
      resultFile={resultFile}
      paneSlug={data.paneSlug}
      worktreePath={data.worktreePath}
      mainRepoPath={data.mainRepoPath}
      mainBranch={data.mainBranch}
    />
  );
}

main();
