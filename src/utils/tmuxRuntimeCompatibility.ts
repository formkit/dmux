import { spawnSync } from 'child_process';

export const REQUIRED_TMUX_UPDATE_ENV = [
  'TERM_PROGRAM',
] as const;

export const REQUIRED_TMUX_TERMINAL_OVERRIDES = [
  'xterm-256color:Ms=\\E]52;c;%p2%s\\007',
] as const;

interface TmuxRuntimeCompatibilitySnapshot {
  terminalOverrides: string[];
  updateEnvironment: string[];
}

function parseTmuxArrayOptionValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseTmuxArrayOptionValues(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^[^[]+\[\d+\]\*?\s+(.*)$/);
      return parseTmuxArrayOptionValue(match ? match[1] : line);
    });
}

export function buildTmuxRuntimeCompatibilityCommands(
  sessionName: string,
  snapshot: TmuxRuntimeCompatibilitySnapshot
): string[][] {
  const commands: string[][] = [
    ['set-option', '-q', '-t', sessionName, 'set-clipboard', 'on'],
    ['set-option', '-q', '-t', sessionName, 'allow-passthrough', 'all'],
  ];

  for (const value of REQUIRED_TMUX_UPDATE_ENV) {
    if (!snapshot.updateEnvironment.includes(value)) {
      commands.push(['set-option', '-q', '-ag', '-t', sessionName, 'update-environment', value]);
    }
  }

  for (const value of REQUIRED_TMUX_TERMINAL_OVERRIDES) {
    if (!snapshot.terminalOverrides.includes(value)) {
      commands.push(['set-option', '-q', '-ag', '-t', sessionName, 'terminal-overrides', value]);
    }
  }

  return commands;
}

function readTmuxArrayOption(sessionName: string, optionName: string): string[] {
  try {
    const result = spawnSync(
      'tmux',
      ['show-options', '-A', '-t', sessionName, optionName],
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    if (result.status !== 0) {
      return [];
    }

    return parseTmuxArrayOptionValues(result.stdout || '');
  } catch {
    return [];
  }
}

export function ensureTmuxRuntimeCompatibility(sessionName: string): void {
  const commands = buildTmuxRuntimeCompatibilityCommands(sessionName, {
    terminalOverrides: readTmuxArrayOption(sessionName, 'terminal-overrides'),
    updateEnvironment: readTmuxArrayOption(sessionName, 'update-environment'),
  });

  for (const args of commands) {
    try {
      spawnSync('tmux', args, { stdio: 'pipe' });
    } catch {
      // Best effort only. Unknown options or older tmux versions should not block startup.
    }
  }
}
