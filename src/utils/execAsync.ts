import { spawn, type SpawnOptions } from 'child_process';

export interface ExecAsyncOptions extends Omit<SpawnOptions, 'stdio'> {
  /** Timeout in milliseconds. Default: 30000 (30s) */
  timeout?: number;
  /** If true, resolve with empty string on error instead of rejecting */
  silent?: boolean;
}

/**
 * Async wrapper around child_process.spawn that returns stdout as a string.
 * This is the non-blocking replacement for execSync.
 *
 * @param command - The command to execute (can include spaces)
 * @param options - Spawn options plus timeout and silent flags
 * @returns Promise resolving to trimmed stdout
 *
 * @example
 * // Basic usage
 * const output = await execAsync('tmux list-panes');
 *
 * @example
 * // With timeout
 * const output = await execAsync('git status', { timeout: 5000 });
 *
 * @example
 * // Silent mode (returns empty string on error)
 * const output = await execAsync('tmux has-session -t foo', { silent: true });
 */
export function execAsync(
  command: string,
  options: ExecAsyncOptions = {}
): Promise<string> {
  const { timeout = 30000, silent = false, ...spawnOptions } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      ...spawnOptions,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);
    }

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (silent) {
        resolve('');
      } else {
        reject(error);
      }
    });

    proc.on('close', (code: number | null) => {
      if (timeoutId) clearTimeout(timeoutId);

      if (timedOut) {
        if (silent) {
          resolve('');
        } else {
          reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
        }
        return;
      }

      if (code === 0) {
        resolve(stdout.trim());
      } else {
        if (silent) {
          resolve('');
        } else {
          const errorMessage = stderr.trim() || `Command failed with exit code ${code}`;
          reject(new Error(errorMessage));
        }
      }
    });
  });
}

/**
 * Execute multiple commands in parallel, returning all results.
 * Uses Promise.allSettled so one failure doesn't fail all.
 *
 * @param commands - Array of commands to execute
 * @param options - Options applied to all commands
 * @returns Array of results (either string or Error)
 *
 * @example
 * const [dims, panes] = await execAsyncParallel([
 *   'tmux display-message -p "#{window_width}x#{window_height}"',
 *   'tmux list-panes -F "#{pane_id}"'
 * ]);
 */
export async function execAsyncParallel(
  commands: string[],
  options: ExecAsyncOptions = {}
): Promise<Array<string | Error>> {
  const results = await Promise.allSettled(
    commands.map(cmd => execAsync(cmd, options))
  );

  return results.map(result =>
    result.status === 'fulfilled' ? result.value : result.reason
  );
}

/**
 * Execute multiple commands in parallel, returning results only on full success.
 * If any command fails, the entire call rejects.
 *
 * @param commands - Array of commands to execute
 * @param options - Options applied to all commands
 * @returns Array of stdout strings in order
 *
 * @example
 * const [opt1, opt2, opt3] = await execAsyncAll([
 *   'tmux set-option -t sess pane-border-status top',
 *   'tmux set-option -t sess pane-border-style "fg=colour240"',
 *   'tmux set-option -t sess pane-border-format " #{pane_title} "'
 * ]);
 */
export async function execAsyncAll(
  commands: string[],
  options: ExecAsyncOptions = {}
): Promise<string[]> {
  return Promise.all(commands.map(cmd => execAsync(cmd, options)));
}

/**
 * Race multiple equivalent commands, returning the first successful result.
 * Useful for API fallbacks or trying multiple approaches.
 *
 * @param commands - Array of commands to race
 * @param options - Options applied to all commands
 * @returns First successful stdout
 * @throws If all commands fail
 *
 * @example
 * // Try multiple git commands, use first that succeeds
 * const branch = await execAsyncRace([
 *   'git symbolic-ref refs/remotes/origin/HEAD',
 *   'git show-ref --verify refs/heads/main',
 *   'git branch --show-current'
 * ], { silent: false });
 */
export async function execAsyncRace(
  commands: string[],
  options: Omit<ExecAsyncOptions, 'silent'> = {}
): Promise<string> {
  // Use Promise.any to get first success
  // Each command must NOT be silent so failures actually reject
  return Promise.any(
    commands.map(cmd => execAsync(cmd, { ...options, silent: false }))
  );
}
