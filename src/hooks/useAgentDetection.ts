import { useEffect, useState } from 'react';
import { execSync } from 'child_process';
import fs from 'fs/promises';

export default function useAgentDetection() {
  const [availableAgents, setAvailableAgents] = useState<Array<'claude' | 'opencode' | 'vibe'>>([]);

  useEffect(() => {
    (async () => {
      try {
        const agents: Array<'claude' | 'opencode' | 'vibe'> = [];
        const hasClaude = await findClaudeCommand();
        if (hasClaude) agents.push('claude');
        const hasopencode = await findopencodeCommand();
        if (hasopencode) agents.push('opencode');
        const hasVibe = await findVibeCommand();
        if (hasVibe) agents.push('vibe');
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

const findVibeCommand = async (): Promise<string | null> => {
  try {
    const userShell = process.env.SHELL || '/bin/bash';
    const result = execSync(
      `${userShell} -i -c "command -v vibe 2>/dev/null || which vibe 2>/dev/null"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {}

  const commonPaths = [
    `${process.env.HOME}/.local/bin/vibe`,
    '/usr/local/bin/vibe',
    '/opt/homebrew/bin/vibe',
    '/usr/bin/vibe',
    `${process.env.HOME}/bin/vibe`,
  ];
  for (const p of commonPaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  return null;
};
