import { execSync } from 'child_process';
import { execAsync } from './execAsync.js';

/**
 * Helper to trim trailing blank lines from captured content
 */
function trimTrailingBlanks(content: string): { trimmed: string; contentLineCount: number } {
  if (!content) {
    return { trimmed: '', contentLineCount: 0 };
  }

  const allLines = content.split('\n');
  let trailingBlankCount = 0;

  // Count blank lines from the end
  for (let i = allLines.length - 1; i >= 0; i--) {
    if (allLines[i].trim() === '') {
      trailingBlankCount++;
    } else {
      break;
    }
  }

  const contentLineCount = allLines.length - trailingBlankCount;
  const trimmed = allLines.slice(0, -trailingBlankCount || allLines.length).join('\n');

  return { trimmed, contentLineCount };
}

/**
 * Captures the last N lines from a tmux pane asynchronously (non-blocking)
 * Automatically skips trailing blank lines.
 *
 * @param paneId - The tmux pane ID to capture from
 * @param lines - Number of non-blank lines to capture (default: 50)
 * @param maxAttempts - Maximum number of fetch attempts to find content (default: 5)
 * @returns The captured content with trailing blank lines removed, or empty string on failure
 */
export async function capturePaneContentAsync(
  paneId: string,
  lines: number = 50,
  maxAttempts: number = 5
): Promise<string> {
  try {
    let currentLines = lines;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const content = await execAsync(
        `tmux capture-pane -t '${paneId}' -p -S -${currentLines}`,
        { silent: true, timeout: 5000 }
      );

      if (!content) {
        return '';
      }

      const { trimmed, contentLineCount } = trimTrailingBlanks(content);

      // If we have enough actual content lines, return trimmed content
      if (contentLineCount >= lines) {
        return trimmed;
      }

      // If we have some content but not enough, fetch more
      if (contentLineCount > 0 && contentLineCount < lines) {
        currentLines = currentLines + (lines - contentLineCount) + 20;
      } else if (contentLineCount === 0) {
        // All blank lines - try larger window on first attempt
        if (attempt === 0) {
          currentLines = 200;
        } else {
          return '';
        }
      }
    }

    // After max attempts, return whatever we have
    const finalContent = await execAsync(
      `tmux capture-pane -t '${paneId}' -p -S -${currentLines}`,
      { silent: true, timeout: 5000 }
    );

    const { trimmed } = trimTrailingBlanks(finalContent);
    return trimmed;
  } catch {
    return '';
  }
}

/**
 * Captures the last N lines from a tmux pane, automatically skipping trailing blank lines.
 * If the captured content ends with blank lines, it will fetch more lines to ensure
 * we get actual content.
 *
 * @deprecated Use capturePaneContentAsync for non-blocking operation
 * @param paneId - The tmux pane ID to capture from
 * @param lines - Number of non-blank lines to capture (default: 50)
 * @param maxAttempts - Maximum number of fetch attempts to find content (default: 5)
 * @returns The captured content with trailing blank lines removed, or empty string on failure
 */
export function capturePaneContent(
  paneId: string,
  lines: number = 50,
  maxAttempts: number = 5
): string {
  try {
    let currentLines = lines;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      // Capture pane content with line history
      // -p prints to stdout, -S -<lines> starts from <lines> lines back
      const content = execSync(
        `tmux capture-pane -t '${paneId}' -p -S -${currentLines}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );

      if (!content) {
        return '';
      }

      // Split into lines and count trailing blank lines
      const allLines = content.split('\n');
      let trailingBlankCount = 0;

      // Count blank lines from the end
      for (let i = allLines.length - 1; i >= 0; i--) {
        if (allLines[i].trim() === '') {
          trailingBlankCount++;
        } else {
          break;
        }
      }

      // Calculate actual content lines (non-blank)
      const contentLineCount = allLines.length - trailingBlankCount;

      // If we have enough actual content lines, return trimmed content
      if (contentLineCount >= lines) {
        return allLines.slice(0, -trailingBlankCount || allLines.length).join('\n');
      }

      // If we have some content but not enough, and there might be more above
      if (contentLineCount > 0 && contentLineCount < lines) {
        // Fetch more lines to try to get the desired amount
        // Add the number of trailing blanks we found plus some buffer
        currentLines = currentLines + trailingBlankCount + 20;
      } else if (contentLineCount === 0) {
        // All blank lines - the pane might have been cleared
        // Try fetching from a much larger history
        if (attempt === 1) {
          currentLines = 200; // Try a larger window
        } else {
          // Give up, pane is truly empty or cleared
          return '';
        }
      }
    }

    // After max attempts, return whatever we have (trimmed)
    const finalContent = execSync(
      `tmux capture-pane -t '${paneId}' -p -S -${currentLines}`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    const finalLines = finalContent.split('\n');
    let finalTrailingBlankCount = 0;
    for (let i = finalLines.length - 1; i >= 0; i--) {
      if (finalLines[i].trim() === '') {
        finalTrailingBlankCount++;
      } else {
        break;
      }
    }

    return finalLines.slice(0, -finalTrailingBlankCount || finalLines.length).join('\n');
  } catch (error) {
    // Failed to capture pane content
    return '';
  }
}

/**
 * Captures the last N lines from a tmux pane without filtering blank lines.
 * Use this when you specifically want raw output including blanks.
 *
 * @param paneId - The tmux pane ID to capture from
 * @param lines - Number of lines to capture (default: 50)
 * @returns The raw captured content, or empty string on failure
 */
export function capturePaneContentRaw(paneId: string, lines: number = 50): string {
  try {
    const content = execSync(
      `tmux capture-pane -t '${paneId}' -p -S -${lines}`,
      { encoding: 'utf8', stdio: 'pipe' }
    );

    return content;
  } catch (error) {
    return '';
  }
}
