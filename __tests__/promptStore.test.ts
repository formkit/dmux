import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildPromptReadAndDeleteSnippet,
  cleanupPromptFilesForSlug,
  getPromptsDir,
  shellQuote,
  writePromptFile,
} from '../src/utils/promptStore.js';

async function makeTempProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dmux-prompt-store-'));
}

describe('promptStore', () => {
  it('writes prompt files under .dmux/prompts', async () => {
    const projectRoot = await makeTempProjectRoot();
    const promptPath = await writePromptFile(projectRoot, 'feature/test', 'hello world');

    expect(promptPath.startsWith(getPromptsDir(projectRoot))).toBe(true);

    const written = await fs.readFile(promptPath, 'utf-8');
    expect(written).toBe('hello world');
  });

  it('cleans up only files for the requested slug', async () => {
    const projectRoot = await makeTempProjectRoot();

    const slugAPath = await writePromptFile(projectRoot, 'feature-a', 'a');
    const slugBPath = await writePromptFile(projectRoot, 'feature-b', 'b');

    const removed = await cleanupPromptFilesForSlug(projectRoot, 'feature-a');
    expect(removed).toBe(1);

    await expect(fs.access(slugAPath)).rejects.toThrow();
    await expect(fs.readFile(slugBPath, 'utf-8')).resolves.toBe('b');
  });

  it('builds a shell snippet that reads and deletes the prompt file', () => {
    const quoted = shellQuote(`/tmp/o'clock`);
    expect(quoted).toBe(`'/tmp/o'\\''clock'`);

    const snippet = buildPromptReadAndDeleteSnippet('/tmp/dmux prompt.txt');
    expect(snippet).toContain('DMUX_PROMPT_FILE=');
    expect(snippet).toContain('cat "$DMUX_PROMPT_FILE"');
    expect(snippet).toContain('rm -f "$DMUX_PROMPT_FILE"');
  });
});
