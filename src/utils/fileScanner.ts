import { execSync } from 'child_process';
import path from 'path';

/**
 * Scans project files for autocomplete
 * Uses git ls-files for performance and respects .gitignore
 */
export interface FileScanResult {
  files: string[];
  basePath: string;
}

// Cache for file list (refreshed every 5 seconds)
let cachedFiles: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get list of files in the project, relative to project root
 * Uses git ls-files for fast scanning and automatic .gitignore respect
 */
export function scanProjectFiles(projectPath: string): FileScanResult {
  const now = Date.now();

  // Return cached results if fresh
  if (cachedFiles && now - cacheTimestamp < CACHE_TTL) {
    return {
      files: cachedFiles,
      basePath: projectPath,
    };
  }

  try {
    // Use git ls-files for fast, gitignore-aware file listing
    const output = execSync('git ls-files', {
      cwd: projectPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      stdio: ['pipe', 'pipe', 'ignore'], // Ignore stderr
    });

    const files = output
      .split('\n')
      .filter(f => f.trim())
      .filter(f => {
        // Minimal filtering - just exclude obvious non-source files
        // git ls-files already respects .gitignore, so we trust that
        const lower = f.toLowerCase();
        return (
          // Exclude lock files and logs (often large and not useful for reference)
          !lower.endsWith('.lock') &&
          !lower.endsWith('.log') &&
          // Exclude .dmux internal directory (should be gitignored but extra safety)
          !lower.includes('.dmux/')
          // Everything else from git ls-files is included
        );
      })
      .sort();

    // Update cache
    cachedFiles = files;
    cacheTimestamp = now;

    return {
      files,
      basePath: projectPath,
    };
  } catch (error) {
    // Fallback: if git fails, return empty list
    console.error('File scanning failed:', error);
    return {
      files: [],
      basePath: projectPath,
    };
  }
}

/**
 * Fuzzy match a query against a list of file paths
 * Returns sorted list of matches with best matches first
 */
export function fuzzyMatchFiles(query: string, files: string[]): string[] {
  if (!query) {
    return files.slice(0, 50); // Return first 50 files if no query
  }

  const lowerQuery = query.toLowerCase();
  const queryChars = lowerQuery.split('');

  interface Match {
    file: string;
    score: number;
    matchIndices: number[];
  }

  const matches: Match[] = [];

  for (const file of files) {
    const lowerFile = file.toLowerCase();
    const matchIndices: number[] = [];
    let queryIndex = 0;
    let score = 0;
    let lastMatchIndex = -1;

    // Try to match all query characters in order
    for (let i = 0; i < lowerFile.length && queryIndex < queryChars.length; i++) {
      if (lowerFile[i] === queryChars[queryIndex]) {
        matchIndices.push(i);

        // Score: consecutive matches get bonus points
        if (lastMatchIndex === i - 1) {
          score += 10; // Consecutive character bonus
        } else {
          score += 1; // Regular match
        }

        // Bonus for matching at word boundaries (after / or at start)
        if (i === 0 || lowerFile[i - 1] === '/') {
          score += 5;
        }

        lastMatchIndex = i;
        queryIndex++;
      }
    }

    // If all query characters matched, it's a valid match
    if (queryIndex === queryChars.length) {
      // Bonus for shorter paths (prefer files closer to root)
      const pathDepth = file.split('/').length;
      score -= pathDepth * 0.5;

      // Bonus for matching filename (after last /)
      const filename = path.basename(file);
      if (filename.toLowerCase().includes(lowerQuery)) {
        score += 20;
      }

      matches.push({ file, score, matchIndices });
    }
  }

  // Sort by score (descending) and return file paths
  matches.sort((a, b) => b.score - a.score);

  // Limit to top 50 matches for performance
  return matches.slice(0, 50).map(m => m.file);
}

/**
 * Clear the file cache (useful when files are created/deleted)
 */
export function clearFileCache(): void {
  cachedFiles = null;
  cacheTimestamp = 0;
}
