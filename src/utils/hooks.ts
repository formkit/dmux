/**
 * Hooks System
 *
 * Executes user-defined scripts at key lifecycle events.
 * Hook scripts are stored in .dmux/hooks/ and receive context via environment variables.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, accessSync, constants, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { DmuxPane } from '../types.js';
import { HOOKS_DOCUMENTATION, HOOKS_README, EXAMPLE_HOOKS } from './hooksDocs.js';

/**
 * Available hook types
 */
export type HookType =
  | 'before_pane_create'
  | 'pane_created'
  | 'worktree_created'
  | 'before_pane_close'
  | 'pane_closed'
  | 'before_worktree_remove'
  | 'worktree_removed'
  | 'pre_merge'
  | 'post_merge'
  | 'run_test'
  | 'run_dev';

/**
 * Environment data for hooks
 */
export interface HookEnvironment {
  // Always present
  DMUX_ROOT: string;
  DMUX_SERVER_PORT?: string;

  // Pane-specific (present for most hooks)
  DMUX_PANE_ID?: string;
  DMUX_SLUG?: string;
  DMUX_PROMPT?: string;
  DMUX_AGENT?: string;
  DMUX_TMUX_PANE_ID?: string;

  // Worktree-specific
  DMUX_WORKTREE_PATH?: string;
  DMUX_BRANCH?: string;

  // Merge-specific
  DMUX_TARGET_BRANCH?: string;

  // Additional custom data
  [key: string]: string | undefined;
}

/**
 * Find a hook script with priority resolution:
 * 1. .dmux-hooks/ (version controlled, team hooks)
 * 2. .dmux/hooks/ (gitignored, local overrides)
 * 3. ~/.dmux/hooks/ (global user hooks)
 */
export function findHook(projectRoot: string, hookName: HookType): string | null {
  const searchPaths = [
    path.join(projectRoot, '.dmux-hooks', hookName),        // Team hooks (VC)
    path.join(projectRoot, '.dmux', 'hooks', hookName),     // Local override
    path.join(os.homedir(), '.dmux', 'hooks', hookName),    // Global hooks
  ];

  for (const hookPath of searchPaths) {
    if (existsSync(hookPath)) {
      try {
        // Check if file is executable
        accessSync(hookPath, constants.X_OK);
        return hookPath;
      } catch {
        console.error(`[Hooks] Warning: Hook "${hookName}" exists at ${hookPath} but is not executable. Run: chmod +x ${hookPath}`);
        // Continue searching other locations
      }
    }
  }

  return null;
}

/**
 * Build environment variables for a hook
 */
export function buildHookEnvironment(
  projectRoot: string,
  pane?: DmuxPane,
  extraData?: Record<string, string>
): HookEnvironment {
  const env: HookEnvironment = {
    DMUX_ROOT: projectRoot,
    ...process.env, // Inherit parent environment
  };

  // Add server port if available
  const { StateManager } = require('../shared/StateManager.js');
  const state = StateManager.getInstance().getState();
  if (state.serverPort) {
    env.DMUX_SERVER_PORT = String(state.serverPort);
  }

  // Add pane-specific data
  if (pane) {
    env.DMUX_PANE_ID = pane.id;
    env.DMUX_SLUG = pane.slug;
    env.DMUX_PROMPT = pane.prompt;
    env.DMUX_AGENT = pane.agent || 'unknown';
    env.DMUX_TMUX_PANE_ID = pane.paneId;

    if (pane.worktreePath) {
      env.DMUX_WORKTREE_PATH = pane.worktreePath;
      env.DMUX_BRANCH = pane.slug; // Branch name matches slug
    }
  }

  // Add any extra data
  if (extraData) {
    Object.assign(env, extraData);
  }

  return env;
}

/**
 * Execute a hook script asynchronously
 *
 * Hooks run in the background and don't block dmux operations.
 * Errors are logged but don't crash the application.
 */
export async function triggerHook(
  hookName: HookType,
  projectRoot: string,
  pane?: DmuxPane,
  extraData?: Record<string, string>
): Promise<void> {
  // Initialize hooks directory on first use (lazy init)
  initializeHooksDirectory(projectRoot);

  const hookPath = findHook(projectRoot, hookName);

  if (!hookPath) {
    // No hook script found, that's fine
    return;
  }

  // Build environment
  const env = buildHookEnvironment(projectRoot, pane, extraData);

  // Log hook execution
  console.error(`[Hooks] Executing ${hookName} hook: ${hookPath}`);

  try {
    // Spawn hook process in background
    const child = spawn(hookPath, [], {
      env: env as NodeJS.ProcessEnv,
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore', // Don't capture output by default
    });

    // Detach so the hook can run independently
    child.unref();

    // Optional: Log when hook completes (but don't wait for it)
    child.on('exit', (code) => {
      if (code === 0) {
        console.error(`[Hooks] ${hookName} completed successfully`);
      } else if (code !== null) {
        console.error(`[Hooks] ${hookName} exited with code ${code}`);
      }
    });

    child.on('error', (error) => {
      console.error(`[Hooks] ${hookName} failed to start: ${error.message}`);
    });
  } catch (error) {
    console.error(`[Hooks] Failed to execute ${hookName}: ${error}`);
  }
}

/**
 * Execute a hook synchronously (blocking)
 *
 * Use sparingly - only for hooks that MUST complete before proceeding.
 * Most hooks should use triggerHook() instead.
 */
export function triggerHookSync(
  hookName: HookType,
  projectRoot: string,
  pane?: DmuxPane,
  extraData?: Record<string, string>,
  timeoutMs: number = 30000
): { success: boolean; output?: string; error?: string } {
  const hookPath = findHook(projectRoot, hookName);

  if (!hookPath) {
    return { success: true }; // No hook = success
  }

  const env = buildHookEnvironment(projectRoot, pane, extraData);

  console.error(`[Hooks] Executing ${hookName} hook (sync): ${hookPath}`);

  try {
    const output = execSync(hookPath, {
      env: env as NodeJS.ProcessEnv,
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: 'pipe',
    });

    console.error(`[Hooks] ${hookName} completed successfully`);
    return { success: true, output };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`[Hooks] ${hookName} failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      output: error.stdout?.toString() || '',
    };
  }
}

/**
 * Check if a hook exists for a given hook type
 */
export function hasHook(projectRoot: string, hookName: HookType): boolean {
  return findHook(projectRoot, hookName) !== null;
}

/**
 * List all available hooks in the project
 */
export function listAvailableHooks(projectRoot: string): HookType[] {
  const allHooks: HookType[] = [
    'before_pane_create',
    'pane_created',
    'worktree_created',
    'before_pane_close',
    'pane_closed',
    'before_worktree_remove',
    'worktree_removed',
    'pre_merge',
    'post_merge',
    'run_test',
    'run_dev',
  ];

  return allHooks.filter((hook) => hasHook(projectRoot, hook));
}

/**
 * Initialize .dmux-hooks/ directory with documentation and examples
 * This gets called the first time hooks are accessed or when user explicitly initializes
 */
export function initializeHooksDirectory(projectRoot: string): void {
  const hooksDir = path.join(projectRoot, '.dmux-hooks');

  // Skip if already initialized
  if (existsSync(path.join(hooksDir, 'AGENTS.md'))) {
    return;
  }

  console.error('[Hooks] Initializing .dmux-hooks/ directory...');

  // Create main hooks directory
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Write AGENTS.md (complete reference)
  writeFileSync(
    path.join(hooksDir, 'AGENTS.md'),
    HOOKS_DOCUMENTATION,
    'utf-8'
  );

  // Write CLAUDE.md (identical to AGENTS.md, just different filename for Claude Code)
  writeFileSync(
    path.join(hooksDir, 'CLAUDE.md'),
    HOOKS_DOCUMENTATION,
    'utf-8'
  );

  // Write README.md
  writeFileSync(
    path.join(hooksDir, 'README.md'),
    HOOKS_README,
    'utf-8'
  );

  // Create examples directory
  const examplesDir = path.join(hooksDir, 'examples');
  if (!existsSync(examplesDir)) {
    mkdirSync(examplesDir, { recursive: true });
  }

  // Write example hooks
  for (const [filename, content] of Object.entries(EXAMPLE_HOOKS)) {
    const examplePath = path.join(examplesDir, filename);
    writeFileSync(examplePath, content, 'utf-8');

    // Make examples executable
    try {
      execSync(`chmod +x "${examplePath}"`, { stdio: 'pipe' });
    } catch {
      // Ignore chmod errors (Windows, etc.)
    }
  }

  console.error('[Hooks] ✅ Initialized .dmux-hooks/ with documentation and examples');
  console.error('[Hooks] 📝 Read AGENTS.md or CLAUDE.md to get started');
}
