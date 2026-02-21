/**
 * Tests for enriched PR description generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePrDescription } from '../../src/utils/prDescription.js';

// Mock callAgent
const mockCallAgent = vi.fn();
vi.mock('../../src/utils/agentHarness.js', () => ({
  callAgent: (...args: any[]) => mockCallAgent(...args),
}));

// Mock execSync
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
}));

vi.mock('../../src/services/LogService.js', () => ({
  LogService: {
    getInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe('generatePrDescription', () => {
  const defaultOptions = {
    panePrompt: 'Fix authentication bug',
    branch: 'fix-auth',
    cwd: '/test/worktree',
    projectRoot: '/test/main',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecSync.mockImplementation(() => '');
    mockCallAgent.mockResolvedValue(null);
  });

  describe('Data gathering', () => {
    it('should gather commit messages from git log', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git log main..fix-auth')) {
          return 'abc1234 feat: add login\ndef5678 fix: handle null';
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      // Verify the prompt passed to callAgent includes commit messages
      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).toContain('Commits:');
      expect(prompt).toContain('abc1234 feat: add login');
      expect(prompt).toContain('def5678 fix: handle null');
    });

    it('should gather diff stat from git diff --stat', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git diff main...fix-auth --stat')) {
          return ' src/auth.ts | 10 ++++---\n 2 files changed';
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).toContain('Files changed:');
      expect(prompt).toContain('src/auth.ts');
    });

    it('should gather actual diff content', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git diff main...fix-auth' || (command.includes('git diff main...fix-auth') && !command.includes('--stat'))) {
          return 'diff --git a/src/auth.ts b/src/auth.ts\n+const newCode = true;';
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).toContain('Diff:');
      expect(prompt).toContain('+const newCode = true;');
    });

    it('should truncate large diffs to 8000 chars', async () => {
      const largeDiff = 'x'.repeat(10000);
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git diff main...fix-auth') && !command.includes('--stat')) {
          return largeDiff;
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).toContain('...(truncated)');
      // The truncated diff should be 8000 chars + the truncation marker
      expect(prompt).not.toContain('x'.repeat(10000));
    });

    it('should handle missing commit log gracefully', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git log')) {
          throw new Error('fatal: bad revision');
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      const result = await generatePrDescription(defaultOptions);

      // Should not crash, should still return a result
      expect(result.title).toBe('test');

      // Prompt should not include Commits section
      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).not.toContain('Commits:');
    });

    it('should fall back to plain git diff when main...branch diff fails', async () => {
      let diffCalled = false;
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git diff main...fix-auth') && !command.includes('--stat')) {
          throw new Error('fatal: bad revision');
        }
        if (command === 'git diff' || (command.includes('git diff') && !command.includes('main') && !command.includes('--stat') && !command.includes('log'))) {
          diffCalled = true;
          return 'diff --git fallback';
        }
        if (command.includes('git diff main...fix-auth --stat')) {
          throw new Error('fatal: bad revision');
        }
        if (command.includes('git diff --stat')) {
          return 'fallback stat';
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      // Should have attempted fallback diff
      expect(diffCalled).toBe(true);
    });
  });

  describe('Model selection', () => {
    it('should use cheap model for small diffs (<= 3000 chars)', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git diff main...fix-auth') && !command.includes('--stat')) {
          return 'small diff'; // way less than 3000 chars
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const options = mockCallAgent.mock.calls[0][1];
      expect(options.model).toBe('cheap');
    });

    it('should use mid model for large diffs (> 3000 chars)', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git diff main...fix-auth') && !command.includes('--stat')) {
          return 'x'.repeat(4000);
        }
        return '';
      });

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const options = mockCallAgent.mock.calls[0][1];
      expect(options.model).toBe('mid');
    });
  });

  describe('Timeout', () => {
    it('should use 45000ms timeout', async () => {
      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const options = mockCallAgent.mock.calls[0][1];
      expect(options.timeout).toBe(45000);
    });
  });

  describe('Response parsing', () => {
    it('should parse valid JSON response', async () => {
      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'feat: add auth', body: '## Summary\nAdded authentication' })
      );

      const result = await generatePrDescription(defaultOptions);
      expect(result.title).toBe('feat: add auth');
      expect(result.body).toBe('## Summary\nAdded authentication');
    });

    it('should return fallback when agent returns null', async () => {
      mockCallAgent.mockResolvedValue(null);

      const result = await generatePrDescription(defaultOptions);
      expect(result.title).toBe('fix-auth');
      expect(result.body).toContain('Fix authentication bug');
    });

    it('should return fallback when JSON parsing fails', async () => {
      mockCallAgent.mockResolvedValue('not valid json');

      const result = await generatePrDescription(defaultOptions);
      expect(result.title).toBe('fix-auth');
    });

    it('should return fallback when response is missing title', async () => {
      mockCallAgent.mockResolvedValue(
        JSON.stringify({ body: 'no title here' })
      );

      const result = await generatePrDescription(defaultOptions);
      expect(result.title).toBe('fix-auth');
    });
  });

  describe('PR template', () => {
    it('should include PR template when found', async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockImplementation((p: any) => {
        return p.toString().includes('pull_request_template.md');
      });
      vi.mocked(readFileSync).mockReturnValue('## Description\n\n## Testing');

      mockCallAgent.mockResolvedValue(
        JSON.stringify({ title: 'test', body: 'test body' })
      );

      await generatePrDescription(defaultOptions);

      const prompt = mockCallAgent.mock.calls[0][0] as string;
      expect(prompt).toContain('Use this PR template as a guide');
      expect(prompt).toContain('## Description');
    });
  });
});
