import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteJsonSync } from './atomicWrite.js';

const TRUSTED_LEVEL = 'TRUST_FOLDER';
const DEFAULT_GEMINI_DIR = '.gemini';
const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';

type TrustedFoldersConfig = Record<string, string>;

function getTrustedFoldersPath(): string {
  const overridePath = process.env.GEMINI_CLI_TRUSTED_FOLDERS_PATH;
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath;
  }

  const home = process.env.HOME || '';
  if (!home) {
    return '';
  }

  return path.join(home, DEFAULT_GEMINI_DIR, TRUSTED_FOLDERS_FILENAME);
}

function readTrustedFoldersConfig(filePath: string): TrustedFoldersConfig {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const trustedFolders: TrustedFoldersConfig = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          trustedFolders[key] = value;
        }
      }
      return trustedFolders;
    }
  } catch {
    // Fall through to empty config on parse/read errors.
  }

  return {};
}

/**
 * Ensure Gemini treats the given workspace path as trusted.
 *
 * Gemini blocks interactive startup prompts in untrusted folders, which
 * prevents dmux initial prompt bootstrap from running in fresh worktrees.
 */
export function ensureGeminiFolderTrusted(workspacePath: string): void {
  const trustedFoldersPath = getTrustedFoldersPath();
  if (!trustedFoldersPath || !workspacePath) {
    return;
  }

  const resolvedWorkspacePath = path.resolve(workspacePath);
  const trustedFolders = readTrustedFoldersConfig(trustedFoldersPath);

  if (trustedFolders[resolvedWorkspacePath] === TRUSTED_LEVEL) {
    return;
  }

  trustedFolders[resolvedWorkspacePath] = TRUSTED_LEVEL;

  const trustedFoldersDir = path.dirname(trustedFoldersPath);
  fs.mkdirSync(trustedFoldersDir, { recursive: true });
  atomicWriteJsonSync(trustedFoldersPath, trustedFolders, true);

  try {
    fs.chmodSync(trustedFoldersPath, 0o600);
  } catch {
    // Ignore chmod failures on environments that do not support POSIX permissions.
  }
}
