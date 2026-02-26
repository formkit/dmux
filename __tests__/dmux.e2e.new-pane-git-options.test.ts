import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { setTimeout as sleep } from 'node:timers/promises';

function hasCmd(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectPopupRunner(): string | null {
  const distPath = path.join(process.cwd(), 'dist', 'components', 'popups', 'newPanePopup.js');
  if (fs.existsSync(distPath)) {
    return `node "${distPath}"`;
  }

  if (hasCmd('pnpm')) {
    return 'pnpm exec tsx "src/components/popups/newPanePopup.tsx"';
  }

  if (hasCmd('tsx')) {
    return 'tsx "src/components/popups/newPanePopup.tsx"';
  }

  return null;
}

async function poll<T>(
  fn: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 15000,
  intervalMs = 200
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for condition');
}

function capturePane(server: string, session: string): string {
  return execSync(`tmux -L ${server} capture-pane -p -t ${session}:0.0`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}

async function waitForPaneText(
  server: string,
  session: string,
  expectedText: string,
  timeoutMs = 15000
): Promise<void> {
  await poll(
    () => capturePane(server, session),
    (paneText) => paneText.includes(expectedText),
    timeoutMs,
    150
  );
}

const runE2E = process.env.DMUX_E2E === '1';
const popupRunner = detectPopupRunner();
const canRun = runE2E && hasCmd('tmux') && !!popupRunner;

describe.sequential('dmux e2e: new pane git options popup', () => {
  it.runIf(canRun)('writes prompt + base branch + branch override payload', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-ok';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');
    const existingBaseBranch = execSync('git branch --show-current', {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'e2e prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${existingBaseBranch}'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });

      // Type explicit branch/worktree override and submit.
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-git-options'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      const payload = await poll(
        async () => {
          try {
            const raw = await fsp.readFile(resultFile, 'utf-8');
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        (value) => !!value
      );

      expect(payload.success).toBe(true);
      expect(payload.data.prompt).toBe('e2e prompt');
      expect(payload.data.branchName).toBe('feat/e2e-git-options');
      expect(payload.data.baseBranch).toBe(existingBaseBranch);
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(canRun)('rejects non-existent base branch overrides (strict mode)', async () => {
    const server = `dmux-e2e-gitopt-${Date.now()}`;
    const session = 'dmux-e2e-gitopt-strict';
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-gitopt-'));
    const resultFile = path.join(tempDir, 'result.json');

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      const popupCommand = `${popupRunner} "${resultFile}" "${process.cwd()}" 1`;
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${popupCommand}' Enter`, { stdio: 'pipe' });

      await waitForPaneText(server, session, 'Enter a prompt for your AI agent.');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'strict mode prompt'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      // Type a non-existent branch, then continue to branch-name field and attempt submit.
      await waitForPaneText(server, session, 'Base branch override (optional)');
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'branch-that-should-not-exist-12345'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Tab`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'feat/e2e-invalid-base'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      await sleep(800);

      // Strict validation should block submission, so no result file yet.
      const resultExists = fs.existsSync(resultFile);
      expect(resultExists).toBe(false);
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(!canRun)('skipped: tmux or popup runner unavailable', () => {
    // Intentionally empty
  });
});
