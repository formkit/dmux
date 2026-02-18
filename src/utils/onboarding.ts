import chalk from 'chalk';
import os from 'os';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'stream';
import { LogService } from '../services/LogService.js';
import { runTmuxConfigOnboardingIfNeeded } from './tmuxConfigOnboarding.js';
import {
  hasCompletedOpenRouterOnboarding,
  persistOpenRouterApiKeyToShell,
  writeOpenRouterOnboardingState,
} from './openRouterApiKeySetup.js';

async function promptYesNo(question: string, defaultYes: boolean = true): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    return defaultYes;
  } finally {
    rl.close();
  }
}

async function promptHiddenInput(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return '';
  }

  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) {
        process.stdout.write(typeof chunk === 'string' ? chunk : chunk.toString());
      }
      callback();
    },
  });

  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    muted = false;
    const answerPromise = rl.question(`${question} `);
    muted = true;
    const answer = await answerPromise;
    muted = false;
    process.stdout.write('\n');
    return answer.trim();
  } finally {
    muted = false;
    rl.close();
  }
}

export async function runOpenRouterApiKeyOnboardingIfNeeded(): Promise<void> {
  const logger = LogService.getInstance();

  try {
    const homeDir = process.env.HOME || os.homedir();
    if (!homeDir) {
      return;
    }

    const existingApiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (existingApiKey) {
      await writeOpenRouterOnboardingState(homeDir, 'existing-env');
      return;
    }

    const completed = await hasCompletedOpenRouterOnboarding(homeDir);
    if (completed) {
      return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      logger.debug(
        'Skipping OpenRouter API key onboarding because terminal is non-interactive',
        'onboarding'
      );
      return;
    }

    const shouldConfigure = await promptYesNo(
      'OPENROUTER_API_KEY is not set. Configure it now to enable AI-powered features?',
      true
    );

    if (!shouldConfigure) {
      await writeOpenRouterOnboardingState(homeDir, 'skip');
      return;
    }

    const apiKey = await promptHiddenInput('Enter your OpenRouter API key:');
    if (!apiKey) {
      console.log(chalk.yellow('Skipping OpenRouter setup (no API key entered).'));
      await writeOpenRouterOnboardingState(homeDir, 'skip');
      return;
    }

    const { shellConfigPath } = await persistOpenRouterApiKeyToShell(apiKey, {
      shellPath: process.env.SHELL,
      homeDir,
    });

    process.env.OPENROUTER_API_KEY = apiKey;
    await writeOpenRouterOnboardingState(homeDir, 'configured', shellConfigPath);

    console.log(chalk.green(`Saved OPENROUTER_API_KEY to ${shellConfigPath}`));
    console.log(chalk.yellow(`Run 'source ${shellConfigPath}' or open a new shell to load it globally.`));
  } catch (error) {
    logger.warn(
      `OpenRouter onboarding failed: ${error instanceof Error ? error.message : String(error)}`,
      'onboarding'
    );
  }
}

/**
 * Run all first-run onboarding checks in one place.
 * This currently includes:
 * - tmux config suggestion/setup
 * - OpenRouter API key setup
 */
export async function runFirstRunOnboardingIfNeeded(): Promise<void> {
  await runTmuxConfigOnboardingIfNeeded();
  await runOpenRouterApiKeyOnboardingIfNeeded();
}
