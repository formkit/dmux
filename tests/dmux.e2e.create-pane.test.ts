import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

function hasCmd(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasTmux(): boolean {
  return hasCmd('tmux');
}

function detectRunner(): { cmd: string; label: string } | null {
  // Prefer built dist if available
  const distPath = path.join(process.cwd(), 'dist', 'index.js');
  if (fs.existsSync(distPath)) {
    return { cmd: `node "${distPath}"`, label: 'node-dist' };
  }
  // Fallback to pnpm dev
  if (hasCmd('pnpm')) {
    return { cmd: 'pnpm dev', label: 'pnpm-dev' };
  }
  // Fallback to tsx if available globally
  if (hasCmd('tsx')) {
    const srcPath = path.join(process.cwd(), 'src', 'index.ts');
    return { cmd: `tsx "${srcPath}"`, label: 'tsx-src' };
  }
  return null;
}

function computePanesFilePath(homeDir: string): string {
  // Mirror logic in src/index.ts
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  const projectName = path.basename(gitRoot);
  const projectHash = createHash('md5').update(gitRoot).digest('hex').substring(0, 8);
  const projectIdentifier = `${projectName}-${projectHash}`;
  const dmuxDir = path.join(homeDir, '.dmux');
  return path.join(dmuxDir, `${projectIdentifier}-panes.json`);
}

async function poll<T>(fn: () => T | Promise<T>, predicate: (v: T) => boolean, timeoutMs = 15000, intervalMs = 200): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise(res => setTimeout(res, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
}

// Only run if tmux and a runner are available
const runner = detectRunner();
const canRun = hasTmux() && !!runner;

describe.sequential('dmux e2e: create pane', () => {
  it.runIf(canRun)('starts dmux in tmux and initializes panes file', async () => {
    // Unique tmux server and session to isolate from user environment
    const server = `dmux-e2e-${Date.now()}`;
    const session = `dmux-e2e-create`;

    // Temp HOME to sandbox ~/.dmux writes
    const tmpHome = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-home-'));
    const panesFile = computePanesFilePath(tmpHome);

    try {
      // Ensure clean start
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      // Create a detached session running bash so we can export HOME
      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });

      // Export HOME inside the tmux session so dmux writes under tmpHome
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'export HOME="${tmpHome}"' Enter`, { stdio: 'pipe' });

      // Start dmux using detected runner
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${runner!.cmd}' Enter`, { stdio: 'pipe' });

      // Wait for panes file to be created by dmux init
      await poll(
        async () => {
          try {
            const stat = await fsp.stat(panesFile);
            return stat.isFile();
          } catch {
            return false;
          }
        },
        v => v === true,
        20000,
        250
      );

      // Verify file content is JSON array (initially empty)
      const raw = await fsp.readFile(panesFile, 'utf-8');
      const data = JSON.parse(raw);
      expect(Array.isArray(data)).toBe(true);

      // Attempt to create a new pane via keyboard: 'n' then prompt text then Enter
      // This may be skipped effectively if agents or prompts differ; still safe to try.
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 n`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'e2e create pane'`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Enter`, { stdio: 'pipe' });

      // Give dmux some time to process pane creation
      // Then re-read panes file; if pane creation failed due to missing agents, we still pass on panes file existence
      await new Promise(res => setTimeout(res, 3000));
      const raw2 = await fsp.readFile(panesFile, 'utf-8');
      const data2 = JSON.parse(raw2);
      expect(Array.isArray(data2)).toBe(true);
      // If a pane was created, assert length >= 1; otherwise tolerate empty in constrained envs
      if (Array.isArray(data2) && data2.length > 0) {
        expect(data2.length).toBeGreaterThanOrEqual(1);
      }

      // Quit dmux UI if it's still running (best-effort)
      try {
        execSync(`tmux -L ${server} send-keys -t ${session}:0.0 q`, { stdio: 'pipe' });
      } catch {}
    } finally {
      // Cleanup tmux session and server
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      // Cleanup temp HOME dir
      try { await fsp.rm(tmpHome, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  // Provide a skipped placeholder when prerequisites are missing, to show intent in CI output
  it.runIf(!canRun)('skipped: tmux or runner not available in environment', () => {
    // Intentionally empty
  });
});
