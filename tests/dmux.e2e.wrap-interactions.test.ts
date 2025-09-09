import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { wrapText } from '../src/utils/input.js';

function hasCmd(cmd: string): boolean {
  try { execSync(`command -v ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
}

function detectRunner(): { cmd: string; label: string } | null {
  const distPath = path.join(process.cwd(), 'dist', 'index.js');
  if (fs.existsSync(distPath)) return { cmd: `node "${distPath}"`, label: 'node-dist' };
  if (hasCmd('pnpm')) return { cmd: 'pnpm dev', label: 'pnpm-dev' };
  if (hasCmd('tsx')) return { cmd: `tsx "${path.join(process.cwd(), 'src', 'index.ts')}"`, label: 'tsx-src' };
  return null;
}

const runner = detectRunner();
const canRun = hasCmd('tmux') && !!runner;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function capturePane(server: string, session: string): string {
  return execSync(`tmux -L ${server} capture-pane -p -t ${session}:0.0`, { encoding: 'utf-8', stdio: 'pipe' });
}

function getInputLines(captured: string): string[] {
  const lines = captured.split('\n');
  const inputLines: string[] = [];
  for (const l of lines) {
    if (l.startsWith('> ') || l.startsWith('  ')) inputLines.push(l.replace(/^>\s/, '').replace(/^\s{2}/, ''));
  }
  return inputLines;
}

describe.sequential('dmux e2e: input wrapping interactions', () => {
  it.runIf(canRun)('wraps full word at the moment overflow occurs (on screen)', async () => {
    const server = `dmux-e2e-wrap-${Date.now()}`;
    const session = `dmux-e2e-wrap`;
    const tmpHome = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmux-e2e-home-'));

    try {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}

      execSync(`tmux -L ${server} -f /dev/null new-session -d -s ${session} -n main bash`, { stdio: 'pipe' });
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 'export HOME="${tmpHome}"' Enter`, { stdio: 'pipe' });
      // Constrain pane width to produce deterministic wrapping inside CleanTextInput (columns - 7 = 20)
      execSync(`tmux -L ${server} resize-pane -t ${session}:0.0 -x 27 -y 20`, { stdio: 'pipe' });

      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${runner!.cmd}' Enter`, { stdio: 'pipe' });
      // Open New Pane dialog
      await sleep(500);
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 n`, { stdio: 'pipe' });
      await sleep(300);

      const width = 20; // based on 27 cols - 7 padding
      const text = 'lorem ipsum dolor sit amet consectetur';

      // Find first index where wrapping occurs for the given width
      let wrapTriggerIndex = -1;
      let expectedFirstLine = '';
      for (let i = 1; i < text.length; i++) {
        const before = wrapText(text.slice(0, i), width);
        const after = wrapText(text.slice(0, i + 1), width);
        if (before.length === 1 && after.length > 1) {
          wrapTriggerIndex = i;
          expectedFirstLine = after[0].line;
          break;
        }
      }

      // Type characters up to just before wrap
      for (let i = 0; i < wrapTriggerIndex; i++) {
        execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${text[i]}'`, { stdio: 'pipe' });
        await sleep(30);
      }

      // Verify still single visual line in the input area
      let cap = capturePane(server, session);
      let inputs = getInputLines(cap);
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.length).toBe(1);

      // Type the character that causes the wrap
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 '${text[wrapTriggerIndex]}'`, { stdio: 'pipe' });
      await sleep(80);

      cap = capturePane(server, session);
      inputs = getInputLines(cap);
      expect(inputs.length).toBeGreaterThan(1);
      expect(inputs[0]).toBe(expectedFirstLine);

      // Best-effort quit dialog
      execSync(`tmux -L ${server} send-keys -t ${session}:0.0 Escape`, { stdio: 'pipe' });
    } finally {
      try { execSync(`tmux -L ${server} kill-session -t ${session}`, { stdio: 'pipe' }); } catch {}
      try { execSync(`tmux -L ${server} kill-server`, { stdio: 'pipe' }); } catch {}
      try { await fsp.rm(tmpHome, { recursive: true, force: true }); } catch {}
    }
  }, 120000);

  it.runIf(!canRun)('skipped: tmux or runner not available in environment', () => {});
});
