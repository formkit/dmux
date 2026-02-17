import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildRecommendedTmuxConfig,
  getTmuxConfigCandidatePaths,
  hasMeaningfulTmuxConfig,
} from '../src/utils/tmuxConfigOnboarding.js';

describe('tmux config onboarding utils', () => {
  it('returns expected tmux config candidate paths', () => {
    const home = '/tmp/example-home';
    const paths = getTmuxConfigCandidatePaths(home);

    expect(paths).toEqual([
      '/tmp/example-home/.tmux.conf',
      '/tmp/example-home/.config/tmux/tmux.conf',
    ]);
  });

  it('detects missing tmux config', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-onboarding-'));

    try {
      const result = await hasMeaningfulTmuxConfig(homeDir);
      expect(result).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('detects existing tmux config from ~/.tmux.conf', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-onboarding-'));

    try {
      writeFileSync(join(homeDir, '.tmux.conf'), "set -g mouse on\n", 'utf-8');
      const result = await hasMeaningfulTmuxConfig(homeDir);
      expect(result).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('treats empty tmux config as not configured', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-onboarding-'));

    try {
      writeFileSync(join(homeDir, '.tmux.conf'), '', 'utf-8');
      const result = await hasMeaningfulTmuxConfig(homeDir);
      expect(result).toBe(false);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('detects existing tmux config from ~/.config/tmux/tmux.conf', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'dmux-onboarding-'));

    try {
      const configDir = join(homeDir, '.config', 'tmux');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'tmux.conf'), "set -g mouse on\n", 'utf-8');

      const result = await hasMeaningfulTmuxConfig(homeDir);
      expect(result).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('builds dark and light presets with theme-specific colors', () => {
    const dark = buildRecommendedTmuxConfig('dark');
    const light = buildRecommendedTmuxConfig('light');

    expect(dark).toContain("set -g window-style 'fg=colour247,bg=colour236'");
    expect(light).toContain("set -g window-style 'fg=colour238,bg=colour255'");

    expect(dark).toContain('set -g pane-border-status top');
    expect(light).toContain('set -g pane-border-status top');
  });
});
