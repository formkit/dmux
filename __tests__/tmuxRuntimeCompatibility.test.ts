import { describe, expect, it } from 'vitest';
import {
  buildTmuxRuntimeCompatibilityCommands,
  parseTmuxArrayOptionValues,
} from '../src/utils/tmuxRuntimeCompatibility.js';

describe('tmuxRuntimeCompatibility', () => {
  it('parses tmux array option output', () => {
    const parsed = parseTmuxArrayOptionValues(
      [
        'terminal-overrides[0] linux*:AX@',
        'terminal-overrides[1] "xterm-256color:Ms=\\\\E]52;c;%p2%s\\\\007"',
        'update-environment[8]* TERM_PROGRAM',
      ].join('\n')
    );

    expect(parsed).toEqual([
      'linux*:AX@',
      'xterm-256color:Ms=\\\\E]52;c;%p2%s\\\\007',
      'TERM_PROGRAM',
    ]);
  });

  it('builds runtime commands for missing compatibility settings', () => {
    const commands = buildTmuxRuntimeCompatibilityCommands('dmux-test', {
      terminalOverrides: [],
      updateEnvironment: [],
    });

    expect(commands).toEqual([
      ['set-option', '-q', '-t', 'dmux-test', 'set-clipboard', 'on'],
      ['set-option', '-q', '-t', 'dmux-test', 'allow-passthrough', 'all'],
      ['set-option', '-q', '-ag', '-t', 'dmux-test', 'update-environment', 'TERM_PROGRAM'],
      ['set-option', '-q', '-ag', '-t', 'dmux-test', 'terminal-overrides', 'xterm-256color:Ms=\\E]52;c;%p2%s\\007'],
    ]);
  });

  it('does not duplicate array entries already present', () => {
    const commands = buildTmuxRuntimeCompatibilityCommands('dmux-test', {
      terminalOverrides: ['linux*:AX@', 'xterm-256color:Ms=\\E]52;c;%p2%s\\007'],
      updateEnvironment: ['DISPLAY', 'TERM_PROGRAM'],
    });

    expect(commands).toEqual([
      ['set-option', '-q', '-t', 'dmux-test', 'set-clipboard', 'on'],
      ['set-option', '-q', '-t', 'dmux-test', 'allow-passthrough', 'all'],
    ]);
  });
});
