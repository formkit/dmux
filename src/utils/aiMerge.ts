/**
 * AI-Assisted Merge Utilities
 *
 * Uses AI to help resolve merge conflicts intelligently
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Call OpenRouter API for AI assistance with model fallback
 */
async function callOpenRouter(prompt: string, maxTokens: number = 1000, timeoutMs: number = 12000): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const models = ['google/gemini-2.5-flash', 'x-ai/grok-4-fast:free', 'openai/gpt-4o-mini'];

  for (const model of models) {
    try {
      const response = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: maxTokens,
            temperature: 0.3,
          }),
        },
        timeoutMs
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        return data.choices[0].message.content.trim();
      }
    } catch {
      // Try next model
      continue;
    }
  }

  return null;
}

/**
 * Call Claude Code CLI for AI assistance
 */
async function callClaudeCode(prompt: string, timeoutMs: number = 15000): Promise<string | null> {
  try {
    const result = execSync(
      `echo "${prompt.replace(/"/g, '\\"')}" | claude --no-interactive --max-turns 1 2>/dev/null`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: timeoutMs,
      }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get comprehensive git diff with context for commit message generation
 */
export function getComprehensiveDiff(repoPath: string): { diff: string; summary: string } {
  try {
    // Get staged changes first, then fall back to unstaged if nothing staged
    let diff = execSync('git diff --cached', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    let staged = true;

    // If nothing staged, check unstaged changes
    if (!diff.trim()) {
      diff = execSync('git diff', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      staged = false;
    }

    // Get file summary
    const statusCmd = staged ? 'git diff --cached --stat' : 'git diff --stat';
    const summary = execSync(statusCmd, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return { diff, summary };
  } catch {
    return { diff: '', summary: '' };
  }
}

/**
 * Get AI-generated commit message from git diff
 * Returns null if generation fails, so caller can handle fallback
 */
export async function generateCommitMessage(repoPath: string): Promise<string | null> {
  try {
    const { diff, summary } = getComprehensiveDiff(repoPath);

    if (!diff.trim()) {
      return null; // No changes, let caller handle
    }

    // Include more context (up to 5000 chars) for better commit messages
    const contextDiff = diff.length > 5000 ? diff.slice(0, 5000) + '\n...(truncated)' : diff;

    const prompt = `Generate a concise conventional commit message (e.g., "feat: add feature", "fix: bug") for these changes. Respond with ONLY the commit message, nothing else:\n\nFile changes:\n${summary}\n\nDiff:\n${contextDiff}`;

    // Try OpenRouter first
    let message = await callOpenRouter(prompt, 50);
    if (message) {
      // Clean up the response
      message = message.replace(/^["']|["']$/g, '').trim();
      if (message && message.length < 100) {
        return message;
      }
    }

    // Try Claude Code as fallback
    message = await callClaudeCode(prompt);
    if (message) {
      message = message.replace(/^["']|["']$/g, '').trim();
      if (message && message.length < 100) {
        return message;
      }
    }

    // Both methods failed
    return null;
  } catch {
    return null;
  }
}

/**
 * Read a file with conflict markers
 */
async function readConflictFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Parse conflict sections from a file
 */
interface ConflictSection {
  ours: string;
  theirs: string;
  base?: string;
}

function parseConflicts(content: string): ConflictSection[] {
  const sections: ConflictSection[] = [];
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      let ours = '';
      let theirs = '';
      let base = '';

      i++;
      // Read "ours" section
      while (i < lines.length && !lines[i].startsWith('=======')) {
        ours += lines[i] + '\n';
        i++;
      }

      i++; // Skip =======
      // Read "theirs" section (or base if 3-way)
      while (i < lines.length && !lines[i].startsWith('>>>>>>>') && !lines[i].startsWith('|||||||')) {
        if (lines[i].startsWith('|||||||')) {
          break;
        }
        theirs += lines[i] + '\n';
        i++;
      }

      // Check for 3-way merge (with base)
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        base = theirs;
        theirs = '';
        i++; // Skip |||||||
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          theirs += lines[i] + '\n';
          i++;
        }
      }

      sections.push({
        ours: ours.trim(),
        theirs: theirs.trim(),
        base: base.trim() || undefined,
      });
    }
    i++;
  }

  return sections;
}

/**
 * Use AI to resolve a merge conflict
 */
export async function aiResolveConflict(
  filePath: string,
  repoPath: string
): Promise<{ success: boolean; resolvedContent?: string; error?: string }> {
  try {
    const fullPath = path.join(repoPath, filePath);
    const content = await readConflictFile(fullPath);
    const conflicts = parseConflicts(content);

    if (conflicts.length === 0) {
      return {
        success: true,
        resolvedContent: content,
      };
    }

    // For now, use a simple strategy: try to intelligently merge both versions
    const prompt = `You are resolving a git merge conflict. Below is a file with conflict markers.

Your task: Provide the COMPLETE resolved file content that intelligently combines both versions. Do NOT include any explanations, just the final file content.

File: ${filePath}

Conflict sections:
${conflicts
  .map(
    (c, i) => `
Conflict ${i + 1}:
<<<<<<< OURS (current branch)
${c.ours}
=======
>>>>>>> THEIRS (incoming branch)
${c.theirs}
`
  )
  .join('\n')}

Full file content:
${content}

Respond with ONLY the complete resolved file content, no explanations:`;

    // Try OpenRouter with longer timeout for conflict resolution
    let resolved = await callOpenRouter(prompt, 2000, 20000);
    if (!resolved) {
      // Try Claude Code with longer timeout for conflict resolution
      resolved = await callClaudeCode(prompt, 20000);
    }

    if (!resolved) {
      return {
        success: false,
        error: 'AI resolution unavailable',
      };
    }

    // Remove any markdown code fences if present
    resolved = resolved.replace(/^```[\w]*\n/gm, '').replace(/\n```$/gm, '');

    return {
      success: true,
      resolvedContent: resolved,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve all conflicts in a repository using AI
 */
export async function aiResolveAllConflicts(
  repoPath: string,
  conflictFiles: string[]
): Promise<{ success: boolean; resolvedFiles: string[]; failedFiles: string[]; error?: string }> {
  const resolvedFiles: string[] = [];
  const failedFiles: string[] = [];

  for (const file of conflictFiles) {
    const result = await aiResolveConflict(file, repoPath);

    if (result.success && result.resolvedContent) {
      try {
        // Write resolved content
        await fs.writeFile(path.join(repoPath, file), result.resolvedContent, 'utf-8');

        // Stage the resolved file
        execSync(`git add "${file}"`, {
          cwd: repoPath,
          stdio: 'pipe',
        });

        resolvedFiles.push(file);
      } catch {
        failedFiles.push(file);
      }
    } else {
      failedFiles.push(file);
    }
  }

  return {
    success: failedFiles.length === 0,
    resolvedFiles,
    failedFiles,
    error: failedFiles.length > 0 ? `Failed to resolve: ${failedFiles.join(', ')}` : undefined,
  };
}
