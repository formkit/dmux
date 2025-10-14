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
import { LogService } from '../services/LogService.js';

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
        const msg = `Hook "${hookName}" exists at ${hookPath} but is not executable. Run: chmod +x ${hookPath}`;
        console.error('[Hooks] Warning:', msg);
        LogService.getInstance().warn(msg, 'hooks');
        // Continue searching other locations
      }
    }
  }

  return null;
}

/**
 * Build environment variables for a hook
 */
export async function buildHookEnvironment(
  projectRoot: string,
  pane?: DmuxPane,
  extraData?: Record<string, string>
): Promise<HookEnvironment> {
  const env: HookEnvironment = {
    DMUX_ROOT: projectRoot,
    ...process.env, // Inherit parent environment
  };

  // Add server port if available
  const { StateManager } = await import('../shared/StateManager.js');
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
  const env = await buildHookEnvironment(projectRoot, pane, extraData);

  // Log hook execution
  const startMsg = `Executing ${hookName} hook: ${hookPath}`;
  console.error('[Hooks]', startMsg);
  LogService.getInstance().info(startMsg, 'hooks');

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
        const msg = `${hookName} completed successfully`;
        console.error('[Hooks]', msg);
        LogService.getInstance().info(msg, 'hooks');
      } else if (code !== null) {
        const msg = `${hookName} exited with code ${code}`;
        console.error('[Hooks]', msg);
        LogService.getInstance().error(msg, 'hooks');
      }
    });

    child.on('error', (error) => {
      const msg = `${hookName} failed to start: ${error.message}`;
      console.error('[Hooks]', msg);
      LogService.getInstance().error(msg, 'hooks', undefined, error instanceof Error ? error : undefined);
    });
  } catch (error) {
    const msg = `Failed to execute ${hookName}`;
    console.error('[Hooks]', msg, error);
    LogService.getInstance().error(msg, 'hooks', undefined, error instanceof Error ? error : undefined);
  }
}

/**
 * Execute a hook synchronously (blocking)
 *
 * Use sparingly - only for hooks that MUST complete before proceeding.
 * Most hooks should use triggerHook() instead.
 */
export async function triggerHookSync(
  hookName: HookType,
  projectRoot: string,
  pane?: DmuxPane,
  extraData?: Record<string, string>,
  timeoutMs: number = 30000
): Promise<{ success: boolean; output?: string; error?: string }> {
  const hookPath = findHook(projectRoot, hookName);

  if (!hookPath) {
    return { success: true }; // No hook = success
  }

  const env = await buildHookEnvironment(projectRoot, pane, extraData);

  const startMsg = `Executing ${hookName} hook (sync): ${hookPath}`;
  console.error('[Hooks]', startMsg);
  LogService.getInstance().info(startMsg, 'hooks');

  try {
    const output = execSync(hookPath, {
      env: env as NodeJS.ProcessEnv,
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: 'pipe',
    });

    const successMsg = `${hookName} completed successfully`;
    console.error('[Hooks]', successMsg);
    LogService.getInstance().info(successMsg, 'hooks');
    return { success: true, output };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    const msg = `${hookName} failed: ${errorMsg}`;
    console.error('[Hooks]', msg);
    LogService.getInstance().error(msg, 'hooks', undefined, error instanceof Error ? error : undefined);
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

  const initMsg = 'Initializing .dmux-hooks/ directory...';
  console.error('[Hooks]', initMsg);
  LogService.getInstance().info(initMsg, 'hooks');

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

  const completeMsg = '✅ Initialized .dmux-hooks/ with documentation and examples';
  const readmeMsg = '📝 Read AGENTS.md or CLAUDE.md to get started';
  console.error('[Hooks]', completeMsg);
  console.error('[Hooks]', readmeMsg);
  LogService.getInstance().info(completeMsg, 'hooks');
  LogService.getInstance().info(readmeMsg, 'hooks');
}
