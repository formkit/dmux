import { TmuxService } from '../services/TmuxService.js';

const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 75;

// Common shell process names reported by tmux for inactive panes.
const SHELL_PROCESS_NAMES = new Set([
  'bash',
  'zsh',
  'sh',
  'fish',
  'dash',
  'ksh',
  'tcsh',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WaitForForegroundCommandOptions {
  paneId: string;
  tmuxService: TmuxService;
  expectedCommand?: string;
  baselineCommand?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Wait for a pane to hand off from the shell to a foreground command.
 *
 * This avoids output-content heuristics and uses tmux process metadata.
 * If we time out, callers may still send input because the PTY typically buffers it.
 */
export async function waitForForegroundCommand(
  options: WaitForForegroundCommandOptions
): Promise<void> {
  const {
    paneId,
    tmuxService,
    expectedCommand,
    baselineCommand,
    timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let currentCommand = '';
    try {
      currentCommand = await tmuxService.getPaneCurrentCommand(paneId);
    } catch {
      await sleep(pollIntervalMs);
      continue;
    }

    if (!currentCommand) {
      await sleep(pollIntervalMs);
      continue;
    }

    if (expectedCommand && currentCommand === expectedCommand) {
      return;
    }

    if (baselineCommand && currentCommand !== baselineCommand) {
      return;
    }

    if (!expectedCommand && !baselineCommand && !SHELL_PROCESS_NAMES.has(currentCommand)) {
      return;
    }

    await sleep(pollIntervalMs);
  }
}

interface SendPromptViaTmuxOptions {
  paneId: string;
  prompt: string;
  tmuxService: TmuxService;
  expectedCommand?: string;
  baselineCommand?: string;
  prePromptKeys?: string[];
  submitKeys?: string[];
  postPasteDelayMs?: number;
  readyDelayMs?: number;
}

/**
 * Send a full prompt payload to an already-starting interactive agent via tmux paste buffer.
 */
export async function sendPromptViaTmux(
  options: SendPromptViaTmuxOptions
): Promise<void> {
  const {
    paneId,
    prompt,
    tmuxService,
    expectedCommand,
    baselineCommand,
    prePromptKeys = [],
    submitKeys = ['Enter'],
    postPasteDelayMs = 0,
    readyDelayMs = 0,
  } = options;

  try {
    await waitForForegroundCommand({
      paneId,
      tmuxService,
      expectedCommand,
      baselineCommand,
    });
  } catch {
    // Fall through - PTY input buffering still makes this safe in practice.
  }

  if (readyDelayMs > 0) {
    await sleep(readyDelayMs);
  }

  const bufferName = `dmux-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const interKeyDelayMs = 120;
  const interSubmitDelayMs = 60;

  try {
    for (const prePromptKey of prePromptKeys) {
      await tmuxService.sendTmuxKeys(paneId, prePromptKey);
      await sleep(interKeyDelayMs);
    }

    await tmuxService.setBuffer(bufferName, prompt);
    await tmuxService.pasteBuffer(bufferName, paneId);
    if (postPasteDelayMs > 0) {
      await sleep(postPasteDelayMs);
    }
    for (let i = 0; i < submitKeys.length; i += 1) {
      const submitKey = submitKeys[i];
      await tmuxService.sendTmuxKeys(paneId, submitKey);
      if (i < submitKeys.length - 1) {
        await sleep(interSubmitDelayMs);
      }
    }
  } finally {
    try {
      await tmuxService.deleteBuffer(bufferName);
    } catch {
      // Ignore cleanup failures for ephemeral buffers.
    }
  }
}
