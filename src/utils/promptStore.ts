import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';

const PROMPTS_SUBDIR = 'prompts';
const PROMPT_FILE_EXTENSION = '.txt';
const MAX_SLUG_PREFIX_LENGTH = 64;

function sanitizeSlugForFilename(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return 'pane';
  }

  return normalized.slice(0, MAX_SLUG_PREFIX_LENGTH);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function getPromptsDir(projectRoot: string): string {
  return path.join(projectRoot, '.dmux', PROMPTS_SUBDIR);
}

export async function writePromptFile(
  projectRoot: string,
  slug: string,
  prompt: string
): Promise<string> {
  const promptsDir = getPromptsDir(projectRoot);
  await fs.mkdir(promptsDir, { recursive: true });

  const safeSlug = sanitizeSlugForFilename(slug);
  const filename = `${safeSlug}--${Date.now()}-${randomSuffix()}${PROMPT_FILE_EXTENSION}`;
  const promptPath = path.join(promptsDir, filename);

  await fs.writeFile(promptPath, prompt, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  return promptPath;
}

export async function deletePromptFile(promptPath: string): Promise<void> {
  try {
    await fs.rm(promptPath, { force: true });
  } catch {
    // Best-effort cleanup
  }
}

export async function cleanupPromptFilesForSlug(
  projectRoot: string,
  slug: string
): Promise<number> {
  const promptsDir = getPromptsDir(projectRoot);
  const safeSlug = sanitizeSlugForFilename(slug);
  const filenamePrefix = `${safeSlug}--`;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(promptsDir, { withFileTypes: true, encoding: 'utf-8' });
  } catch {
    return 0;
  }

  const removals = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(filenamePrefix))
    .map(async (entry) => {
      try {
        await fs.rm(path.join(promptsDir, entry.name), { force: true });
        return 1;
      } catch {
        return 0;
      }
    });

  const results = await Promise.all(removals);
  return results.reduce((sum, value) => sum + value, 0 as number);
}

export function buildPromptReadAndDeleteSnippet(promptPath: string): string {
  const quotedPromptPath = shellQuote(promptPath);
  return `DMUX_PROMPT_FILE=${quotedPromptPath}; DMUX_PROMPT_CONTENT="$(cat "$DMUX_PROMPT_FILE" 2>/dev/null || true)"; rm -f "$DMUX_PROMPT_FILE"`;
}
