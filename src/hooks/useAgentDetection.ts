import { useEffect, useState } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';

export default function useAgentDetection() {
  const [availableAgents, setAvailableAgents] = useState<Array<'claude' | 'opencode' | 'codex'>>([]);

  useEffect(() => {
    (async () => {
      try {
        const agents: Array<'claude' | 'opencode' | 'codex'> = [];
        const hasClaude = await findClaudeCommand();
        if (hasClaude) agents.push('claude');
        const hasopencode = await findopencodeCommand();
        if (hasopencode) agents.push('opencode');
        const hasCodex = await findCodexCommand();
        if (hasCodex) agents.push('codex');
        setAvailableAgents(agents);
      } catch {}
    })();
  }, []);

  return { availableAgents };
}

const findClaudeCommand = async (): Promise<string | null> => {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v claude 2>/dev/null || which claude 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    `${process.env.HOME}/.claude/local/claude`,
    `${process.env.HOME}/.local/bin/claude`,
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    '/usr/bin/claude',
    `${process.env.HOME}/bin/claude`,
  ];

  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
};

const findCodexCommand = async (): Promise<string | null> => {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v codex 2>/dev/null || which codex 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    `${process.env.HOME}/.local/bin/codex`,
    `${process.env.HOME}/bin/codex`,
    `${process.env.HOME}/.npm-global/bin/codex`,
  ];
  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
};

const findopencodeCommand = async (): Promise<string | null> => {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v opencode 2>/dev/null || which opencode 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
    `${process.env.HOME}/.local/bin/opencode`,
    `${process.env.HOME}/bin/opencode`,
  ];
  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
};
