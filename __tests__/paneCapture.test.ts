import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import { capturePaneContent } from '../src/utils/paneCapture.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('paneCapture', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('joins wrapped tmux lines when capturing pane content', () => {
    vi.mocked(execSync).mockReturnValue('Finished work\n\n');

    const result = capturePaneContent('%1', 30);

    expect(result).toBe('Finished work');
    expect(execSync).toHaveBeenCalledWith(
      "tmux capture-pane -t '%1' -p -J -S -30",
      { encoding: 'utf8', stdio: 'pipe' }
    );
  });
});
