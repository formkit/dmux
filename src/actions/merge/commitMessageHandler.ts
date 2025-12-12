/**
 * Commit Message Handler - UI logic for commit message workflows
 *
 * This module handles ActionResult flows for commit message generation,
 * editing, and manual input. It uses domain logic from utils/ but returns
 * ActionResult objects suitable for TUI/Web/API consumption.
 */

import type { ActionResult } from '../types.js';
import { LogService } from '../../services/LogService.js';

/**
 * Generate commit message with timeout and error handling
 * Returns null if it fails, so caller can fall back to manual input
 */
export async function generateCommitMessageSafe(
  repoPath: string,
  timeoutMs: number = 15000
): Promise<string | null> {
  try {
    const { generateCommitMessage } = await import('../../utils/aiMerge.js');

    // Race between generation and timeout
    const result = await Promise.race([
      generateCommitMessage(repoPath),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    if (!result) {
      LogService.getInstance().warn('AI commit message generation returned null', 'aiMerge');
    }

    return result;
  } catch (error) {
    const errorMsg = `AI commit message generation error: ${error}`;
    LogService.getInstance().error(errorMsg, 'aiMerge', undefined, error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Prompt for commit message with optional AI generation
 * @param repoPath - Path to repository
 * @param mode - 'ai_automatic' | 'ai_editable' | 'manual'
 * @param onCommit - Callback to execute after commit message is obtained
 * @returns ActionResult prompting for commit message
 */
export async function promptForCommitMessage(
  repoPath: string,
  mode: 'ai_automatic' | 'ai_editable' | 'manual',
  onCommit: (message: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const { stageAllChanges } = await import('../../utils/mergeValidation.js');
  const { getComprehensiveDiff } = await import('../../utils/aiMerge.js');

  LogService.getInstance().info(
    `promptForCommitMessage called - repoPath: ${repoPath}, mode: ${mode}`,
    'commitMessageHandler'
  );

  // Stage all changes first
  const stageResult = stageAllChanges(repoPath);
  if (!stageResult.success) {
    LogService.getInstance().error(
      `Failed to stage changes in ${repoPath}: ${stageResult.error}`,
      'commitMessageHandler'
    );
    return {
      type: 'error',
      message: `Failed to stage changes: ${stageResult.error}`,
      dismissable: true
    };
  }

  // Handle manual mode (no AI)
  if (mode === 'manual') {
    return {
      type: 'input',
      title: 'Enter Commit Message',
      message: 'Write a commit message for the changes:',
      placeholder: 'feat: add new feature',
      onSubmit: async (message: string) => {
        if (!message || !message.trim()) {
          return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
        }
        return onCommit(message.trim());
      },
      dismissable: true,
    };
  }

  // AI modes - generate message
  const { diff, summary } = getComprehensiveDiff(repoPath);
  LogService.getInstance().info(
    `getComprehensiveDiff for ${repoPath} - diff length: ${diff.length}, summary: ${summary.substring(0, 100)}`,
    'commitMessageHandler'
  );

  const generatedMessage = await generateCommitMessageSafe(repoPath);
  LogService.getInstance().info(
    `AI generated message for ${repoPath}: ${generatedMessage || '(null - generation failed)'}`,
    'commitMessageHandler'
  );

  // If AI generation failed, fall back to manual with explanation
  if (!generatedMessage) {
    LogService.getInstance().warn(
      `AI commit message generation failed for ${repoPath}, falling back to manual input`,
      'commitMessageHandler'
    );
    return {
      type: 'input',
      title: 'Enter Commit Message',
      message: `⚠️ Auto-generation failed or timed out. Please write a commit message manually.\n\nFiles changed:\n${summary}`,
      placeholder: 'feat: add new feature',
      onSubmit: async (message: string) => {
        if (!message || !message.trim()) {
          return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
        }
        return onCommit(message.trim());
      },
      dismissable: true,
    };
  }

  // AI automatic mode - commit immediately
  if (mode === 'ai_automatic') {
    return onCommit(generatedMessage);
  }

  // AI editable mode - let user review and edit
  return {
    type: 'input',
    title: 'Review & Edit Commit Message',
    message: `Files changed:\n${summary}\n\nGenerated message (edit as needed):`,
    placeholder: 'feat: add new feature',
    defaultValue: generatedMessage,
    onSubmit: async (message: string) => {
      if (!message || !message.trim()) {
        return { type: 'error', message: 'Commit message cannot be empty', dismissable: true };
      }
      return onCommit(message.trim());
    },
    dismissable: true,
  };
}

/**
 * Handle commit with the given options (automatic/editable/manual)
 * This DRYs up the common pattern of presenting commit options and executing
 */
export async function handleCommitWithOptions(
  repoPath: string,
  optionId: 'commit_automatic' | 'commit_ai_editable' | 'commit_manual',
  onSuccess: () => Promise<ActionResult>
): Promise<ActionResult> {
  const { commitChanges } = await import('../../utils/mergeValidation.js');

  LogService.getInstance().info(
    `handleCommitWithOptions called with repoPath: ${repoPath}, optionId: ${optionId}`,
    'commitMessageHandler'
  );

  const mode =
    optionId === 'commit_automatic' ? 'ai_automatic' :
    optionId === 'commit_ai_editable' ? 'ai_editable' :
    'manual';

  return promptForCommitMessage(repoPath, mode, async (message: string) => {
    LogService.getInstance().info(
      `Executing commit in: ${repoPath} with message: ${message.substring(0, 50)}...`,
      'commitMessageHandler'
    );
    const result = commitChanges(repoPath, message);
    if (!result.success) {
      return { type: 'error', message: `Commit failed: ${result.error}`, dismissable: true };
    }
    return onSuccess();
  });
}
