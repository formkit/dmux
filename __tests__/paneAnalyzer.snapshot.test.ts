import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/paneCapture.js', () => ({
  capturePaneContent: vi.fn(() => 'captured from tmux'),
}));

import { PaneAnalyzer } from '../src/services/PaneAnalyzer.js';
import { capturePaneContent } from '../src/utils/paneCapture.js';

describe('PaneAnalyzer snapshot source', () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.mocked(capturePaneContent).mockClear();
    process.env.OPENROUTER_API_KEY = '';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
      return;
    }

    process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  it('uses the worker-provided snapshot instead of recapturing tmux content', async () => {
    const analyzer = new PaneAnalyzer();

    const result = await analyzer.analyzePane(
      '%1',
      undefined,
      'pane-1',
      'provided snapshot from worker'
    );

    expect(capturePaneContent).not.toHaveBeenCalled();
    expect(result).toEqual({ state: 'in_progress' });
  });
});
