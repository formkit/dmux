import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export type OpenRouterOnboardingOutcome = 'existing-env' | 'configured' | 'skip';

interface OpenRouterOnboardingEntry {
  completed: boolean;
  completedAt: string;
  outcome: OpenRouterOnboardingOutcome;
  shellConfigPath?: string;
}

interface OnboardingState {
  openRouterApiKeyOnboarding?: OpenRouterOnboardingEntry;
  [key: string]: unknown;
}

const ONBOARDING_STATE_RELATIVE_PATH = path.join('.dmux', 'onboarding.json');
const OPENROUTER_BLOCK_START = '# >>> dmux openrouter >>>';
const OPENROUTER_BLOCK_END = '# <<< dmux openrouter <<<';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteForPosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteForFish(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

function isFishShell(shellPath?: string): boolean {
  return path.basename(shellPath || '').toLowerCase().includes('fish');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

export function getShellConfigCandidates(shellPath: string | undefined, homeDir: string): string[] {
  const shellName = path.basename(shellPath || '').toLowerCase();

  if (shellName.includes('zsh')) {
    return [
      path.join(homeDir, '.zshrc'),
      path.join(homeDir, '.zprofile'),
    ];
  }

  if (shellName.includes('bash')) {
    return [
      path.join(homeDir, '.bashrc'),
      path.join(homeDir, '.bash_profile'),
      path.join(homeDir, '.profile'),
    ];
  }

  if (shellName.includes('fish')) {
    return [
      path.join(homeDir, '.config', 'fish', 'config.fish'),
    ];
  }

  return [path.join(homeDir, '.profile')];
}

export async function resolveShellConfigPath(shellPath: string | undefined, homeDir: string): Promise<string> {
  const candidates = getShellConfigCandidates(shellPath, homeDir);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function buildOpenRouterExportLine(apiKey: string, shellPath?: string): string {
  const trimmedKey = apiKey.trim();
  if (isFishShell(shellPath)) {
    return `set -gx OPENROUTER_API_KEY ${quoteForFish(trimmedKey)}`;
  }

  return `export OPENROUTER_API_KEY=${quoteForPosix(trimmedKey)}`;
}

export function upsertOpenRouterKeyBlock(existingContent: string, exportLine: string): string {
  const normalizedContent = existingContent.replace(/\r\n/g, '\n');
  const block = `${OPENROUTER_BLOCK_START}\n${exportLine}\n${OPENROUTER_BLOCK_END}`;
  const blockPattern = new RegExp(
    `${escapeRegex(OPENROUTER_BLOCK_START)}[\\s\\S]*?${escapeRegex(OPENROUTER_BLOCK_END)}\\n?`,
    'm'
  );

  if (blockPattern.test(normalizedContent)) {
    const replaced = normalizedContent.replace(blockPattern, `${block}\n`);
    return replaced.endsWith('\n') ? replaced : `${replaced}\n`;
  }

  if (!normalizedContent) {
    return `${block}\n`;
  }

  const withTrailingNewline = normalizedContent.endsWith('\n')
    ? normalizedContent
    : `${normalizedContent}\n`;

  return `${withTrailingNewline}\n${block}\n`;
}

export async function persistOpenRouterApiKeyToShell(
  apiKey: string,
  options?: { shellPath?: string; homeDir?: string }
): Promise<{ shellConfigPath: string; exportLine: string }> {
  const homeDir = options?.homeDir || process.env.HOME || os.homedir();
  if (!homeDir) {
    throw new Error('Unable to determine HOME directory');
  }

  const shellPath = options?.shellPath || process.env.SHELL;
  const shellConfigPath = await resolveShellConfigPath(shellPath, homeDir);

  let existingContent = '';
  try {
    existingContent = await fs.readFile(shellConfigPath, 'utf-8');
  } catch {
    // Expected if shell config does not exist yet
  }

  const exportLine = buildOpenRouterExportLine(apiKey, shellPath);
  const updatedContent = upsertOpenRouterKeyBlock(existingContent, exportLine);

  await fs.mkdir(path.dirname(shellConfigPath), { recursive: true });
  await fs.writeFile(shellConfigPath, updatedContent, 'utf-8');

  return { shellConfigPath, exportLine };
}

export function getOnboardingStatePath(homeDir: string): string {
  return path.join(homeDir, ONBOARDING_STATE_RELATIVE_PATH);
}

export async function readOnboardingState(homeDir: string): Promise<OnboardingState> {
  const statePath = getOnboardingStatePath(homeDir);
  try {
    const raw = await fs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as OnboardingState;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Expected if onboarding state doesn't exist yet
  }

  return {};
}

export async function hasCompletedOpenRouterOnboarding(homeDir: string): Promise<boolean> {
  const state = await readOnboardingState(homeDir);
  return state.openRouterApiKeyOnboarding?.completed === true;
}

export async function writeOpenRouterOnboardingState(
  homeDir: string,
  outcome: OpenRouterOnboardingOutcome,
  shellConfigPath?: string
): Promise<void> {
  const statePath = getOnboardingStatePath(homeDir);
  const currentState = await readOnboardingState(homeDir);

  const nextState: OnboardingState = {
    ...currentState,
    openRouterApiKeyOnboarding: {
      completed: true,
      completedAt: new Date().toISOString(),
      outcome,
      ...(shellConfigPath ? { shellConfigPath } : {}),
    },
  };

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf-8');
}
