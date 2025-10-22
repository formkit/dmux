/**
 * Mock command execution for integration tests
 * Provides pattern-based mocking for execSync calls
 */

import { vi } from 'vitest';
import type { MockTmuxSession } from '../../fixtures/integration/tmuxSession.js';
import type { MockGitRepo } from '../../fixtures/integration/gitRepo.js';
import {
  mockListPanesOutput,
  mockDisplayMessageOutput,
} from '../../fixtures/integration/tmuxSession.js';
import {
  mockWorktreeListOutput,
  mockBranchOutput,
  mockGitStatusOutput,
  mockGitDiffOutput,
} from '../../fixtures/integration/gitRepo.js';

export interface CommandMockContext {
  tmuxSession?: MockTmuxSession;
  gitRepo?: MockGitRepo;
  customHandlers?: Record<string, () => string>;
}

/**
 * Create a mock execSync function that responds to common commands
 */
export function createMockExecSync(context: CommandMockContext) {
  return vi.fn((command: string, options?: any) => {
    const cmd = command.toString().trim();

    // Tmux commands
    if (cmd.startsWith('tmux')) {
      return handleTmuxCommand(cmd, context);
    }

    // Git commands
    if (cmd.startsWith('git')) {
      return handleGitCommand(cmd, context);
    }

    // Custom handlers
    if (context.customHandlers) {
      for (const [pattern, handler] of Object.entries(context.customHandlers)) {
        if (cmd.includes(pattern)) {
          return Buffer.from(handler());
        }
      }
    }

    // Default: return empty buffer
    return Buffer.from('');
  });
}

function handleTmuxCommand(cmd: string, context: CommandMockContext): Buffer {
  const { tmuxSession } = context;

  // List panes
  if (cmd.includes('list-panes')) {
    if (!tmuxSession) return Buffer.from('');
    return Buffer.from(mockListPanesOutput(tmuxSession));
  }

  // Display message (get pane info)
  if (cmd.includes('display-message -p')) {
    if (!tmuxSession) return Buffer.from('');
    const pane = tmuxSession.panes[0]; // Default to first pane
    if (!pane) return Buffer.from('');

    // Extract format string (between quotes)
    const formatMatch = cmd.match(/'([^']+)'/);
    const format = formatMatch ? formatMatch[1] : '';
    return Buffer.from(mockDisplayMessageOutput(format, pane));
  }

  // Split pane (return new pane ID)
  if (cmd.includes('split-window')) {
    const newPaneId = `%${(tmuxSession?.panes.length || 0) + 1}`;
    return Buffer.from(newPaneId);
  }

  // Select pane
  if (cmd.includes('select-pane')) {
    return Buffer.from('');
  }

  // Kill pane
  if (cmd.includes('kill-pane')) {
    return Buffer.from('');
  }

  // Has session
  if (cmd.includes('has-session')) {
    return Buffer.from(''); // Success
  }

  // New session
  if (cmd.includes('new-session')) {
    return Buffer.from('');
  }

  // Refresh client
  if (cmd.includes('refresh-client')) {
    return Buffer.from('');
  }

  // Select layout
  if (cmd.includes('select-layout')) {
    return Buffer.from('');
  }

  // Resize pane
  if (cmd.includes('resize-pane')) {
    return Buffer.from('');
  }

  // Resize window
  if (cmd.includes('resize-window')) {
    return Buffer.from('');
  }

  return Buffer.from('');
}

function handleGitCommand(cmd: string, context: CommandMockContext): Buffer {
  const { gitRepo } = context;

  // Worktree list
  if (cmd.includes('worktree list')) {
    if (!gitRepo) return Buffer.from('');
    return Buffer.from(mockWorktreeListOutput(gitRepo));
  }

  // Worktree add
  if (cmd.includes('worktree add')) {
    return Buffer.from('');
  }

  // Worktree remove
  if (cmd.includes('worktree remove')) {
    return Buffer.from('');
  }

  // Branch list
  if (cmd.includes('branch')) {
    if (!gitRepo) return Buffer.from('');
    return Buffer.from(mockBranchOutput(gitRepo));
  }

  // Status
  if (cmd.includes('status')) {
    return Buffer.from(mockGitStatusOutput(true));
  }

  // Diff
  if (cmd.includes('diff')) {
    return Buffer.from(mockGitDiffOutput([]));
  }

  // Checkout
  if (cmd.includes('checkout')) {
    return Buffer.from('');
  }

  // Merge
  if (cmd.includes('merge')) {
    return Buffer.from('');
  }

  // Add
  if (cmd.includes('add')) {
    return Buffer.from('');
  }

  // Commit
  if (cmd.includes('commit')) {
    return Buffer.from('[main abc123] Commit message');
  }

  // Symbolic ref (get main branch)
  if (cmd.includes('symbolic-ref')) {
    if (!gitRepo) return Buffer.from('refs/heads/main');
    return Buffer.from(`refs/heads/${gitRepo.mainBranch}`);
  }

  // Rev-parse (get current branch)
  if (cmd.includes('rev-parse')) {
    if (!gitRepo) return Buffer.from('main');
    return Buffer.from(gitRepo.currentBranch);
  }

  return Buffer.from('');
}

/**
 * Mock OpenRouter API for slug/commit generation
 */
export function createMockOpenRouterAPI() {
  return {
    generateSlug: vi.fn((prompt: string) => Promise.resolve('test-slug')),
    generateCommitMessage: vi.fn((diff: string) =>
      Promise.resolve('feat: test commit message')
    ),
  };
}
