/**
 * Utility for launching tmux popup modals
 * Requires tmux 3.2+
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PopupOptions {
  width?: number;
  height?: number;
  title?: string;
  // If true, popup is centered. If false, you can provide x/y coordinates
  centered?: boolean;
  x?: number;
  y?: number;
  // Working directory for the popup command
  cwd?: string;
  // Border style - single, double, rounded, heavy, etc.
  borderStyle?: string;
  // Offset from left (e.g., to account for sidebar)
  leftOffset?: number;
}

export interface PopupResult<T> {
  success: boolean;
  data?: T;
  cancelled?: boolean;
  error?: string;
}

/**
 * Launch a tmux popup modal
 * @param command - Command to run in the popup
 * @param options - Popup display options
 * @returns Promise that resolves when popup closes
 */
export async function launchPopup(
  command: string,
  options: PopupOptions = {}
): Promise<PopupResult<string>> {
  const {
    width = 80,
    height = 20,
    title,
    centered = true,
    x,
    y,
    cwd = process.cwd(),
    borderStyle = 'double',
    leftOffset = 0,
  } = options;

  // Create a temp file for the result
  const resultFile = path.join(os.tmpdir(), `dmux-popup-${Date.now()}.json`);

  // Build tmux popup command
  const args: string[] = [
    'display-popup',
    '-E', // Close on command exit
    '-w', width.toString(),
    '-h', height.toString(),
    '-d', `"${cwd}"`,
  ];

  // Add border style if supported (tmux 3.2+)
  // Skip if borderStyle is 'none' (we want no tmux border)
  if (borderStyle && borderStyle !== 'none') {
    args.push('-s', borderStyle);
  }

  // Position: centered or custom
  if (centered) {
    // If leftOffset is provided (e.g., for sidebar), position just to the right of it
    if (leftOffset > 0) {
      // Position 1 char to the right of the sidebar
      args.push('-x', (leftOffset + 1).toString());
      // Position at top of screen
      args.push('-y', '0');
    } else {
      args.push('-x', 'C');
      args.push('-y', 'C');
    }
  } else if (x !== undefined && y !== undefined) {
    args.push('-x', x.toString());
    args.push('-y', y.toString());
  }

  // Title
  if (title) {
    args.push('-T', `"${title}"`);
  }

  // Escape the command for tmux
  const escapedCommand = command.replace(/'/g, "'\\''");

  const fullCommand = `tmux ${args.join(' ')} '${escapedCommand}'`;

  try {
    // Launch popup and wait for it to close
    execSync(fullCommand, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Read result from temp file
    if (fs.existsSync(resultFile)) {
      const resultData = fs.readFileSync(resultFile, 'utf-8');
      fs.unlinkSync(resultFile); // Clean up

      try {
        const result = JSON.parse(resultData);
        return result;
      } catch {
        // Not JSON, treat as plain text
        return {
          success: true,
          data: resultData,
        };
      }
    }

    // No result file = cancelled
    return {
      success: false,
      cancelled: true,
    };
  } catch (error: any) {
    // Clean up temp file if it exists
    if (fs.existsSync(resultFile)) {
      fs.unlinkSync(resultFile);
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Launch a popup that runs a Node.js script
 * @param scriptPath - Path to the compiled JS script
 * @param args - Arguments to pass to the script
 * @param options - Popup display options
 */
export async function launchNodePopup<T = any>(
  scriptPath: string,
  args: string[] = [],
  options: PopupOptions = {}
): Promise<PopupResult<T>> {
  // Get the result file path that the script will write to
  const resultFile = path.join(os.tmpdir(), `dmux-popup-${Date.now()}.json`);

  // Build node command
  const nodeArgs = [scriptPath, resultFile, ...args].map(arg => `"${arg}"`).join(' ');
  const command = `node ${nodeArgs}`;

  return launchPopup(command, options) as Promise<PopupResult<T>>;
}

/**
 * Check if tmux supports popups (3.2+)
 */
export function supportsPopups(): boolean {
  try {
    const version = execSync('tmux -V', { encoding: 'utf-8' }).trim();
    // Extract version number (e.g., "tmux 3.2" -> "3.2")
    const match = version.match(/tmux (\d+\.\d+)/);
    if (match) {
      const versionNum = parseFloat(match[1]);
      return versionNum >= 3.2;
    }
    return false;
  } catch {
    return false;
  }
}
