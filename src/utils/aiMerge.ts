/**
 * AI-Assisted Merge Utilities
 *
 * Uses AI to help resolve merge conflicts intelligently
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Call OpenRouter API for AI assistance
 */
async function callOpenRouter(prompt: string, maxTokens: number = 1000): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      return data.choices[0].message.content.trim();
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Call Claude Code CLI for AI assistance
 */
async function callClaudeCode(prompt: string): Promise<string | null> {
  try {
    const result = execSync(
      `echo "${prompt.replace(/"/g, '\\"')}" | claude --no-interactive --max-turns 1 2>/dev/null`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30000, // 30 second timeout for merge operations
      }
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get AI-generated commit message from git diff
 */
export async function generateCommitMessage(repoPath: string): Promise<string> {
  try {
    // Get staged changes first, then fall back to unstaged if nothing staged
    let diff = execSync('git diff --cached', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // If nothing staged, check unstaged changes
    if (!diff.trim()) {
      diff = execSync('git diff', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }

    if (!diff.trim()) {
      return 'chore: automated commit';
    }

    const prompt = `Generate a concise conventional commit message (e.g., "feat: add feature", "fix: bug") for these changes. Respond with ONLY the commit message, nothing else:\n\n${diff.slice(0, 3000)}`;

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

    // Default fallback
    return 'chore: automated commit';
  } catch {
    return 'chore: automated commit';
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

    // Try OpenRouter
    let resolved = await callOpenRouter(prompt, 2000);
    if (!resolved) {
      // Try Claude Code
      resolved = await callClaudeCode(prompt);
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
