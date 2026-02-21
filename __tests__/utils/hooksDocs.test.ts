/**
 * Tests for hooks documentation and examples
 */

import { describe, it, expect } from 'vitest';
import {
  EXAMPLE_PRE_PR,
  EXAMPLE_POST_PR,
  EXAMPLE_HOOKS,
} from '../../src/utils/hooksDocs.js';

describe('hooksDocs', () => {
  describe('EXAMPLE_PRE_PR', () => {
    it('should start with shebang', () => {
      expect(EXAMPLE_PRE_PR).toMatch(/^#!/);
    });

    it('should reference required environment variables', () => {
      expect(EXAMPLE_PRE_PR).toContain('DMUX_WORKTREE_PATH');
      expect(EXAMPLE_PRE_PR).toContain('DMUX_BRANCH');
      expect(EXAMPLE_PRE_PR).toContain('DMUX_PR_TITLE');
      expect(EXAMPLE_PRE_PR).toContain('DMUX_PR_BODY');
      expect(EXAMPLE_PRE_PR).toContain('DMUX_BASE_BRANCH');
    });

    it('should use claude for review', () => {
      expect(EXAMPLE_PRE_PR).toContain('claude');
    });

    it('should include the 6 review lenses', () => {
      expect(EXAMPLE_PRE_PR).toContain('Correctness');
      expect(EXAMPLE_PRE_PR).toContain('Edge Cases');
      expect(EXAMPLE_PRE_PR).toContain('Security');
      expect(EXAMPLE_PRE_PR).toContain('Error Handling');
      expect(EXAMPLE_PRE_PR).toContain('Test Gaps');
      expect(EXAMPLE_PRE_PR).toContain('Architecture');
    });

    it('should exit 0 on success', () => {
      expect(EXAMPLE_PRE_PR).toContain('exit 0');
    });

    it('should use set -e for error handling', () => {
      expect(EXAMPLE_PRE_PR).toContain('set -e');
    });

    it('should cd into worktree path', () => {
      expect(EXAMPLE_PRE_PR).toContain('cd "$DMUX_WORKTREE_PATH"');
    });

    it('should truncate large diffs', () => {
      expect(EXAMPLE_PRE_PR).toContain('MAX_CHARS');
      expect(EXAMPLE_PRE_PR).toContain('truncated');
    });
  });

  describe('EXAMPLE_HOOKS registry', () => {
    it('should include pre_pr.example', () => {
      expect(EXAMPLE_HOOKS).toHaveProperty('pre_pr.example');
    });

    it('should include post_pr.example', () => {
      expect(EXAMPLE_HOOKS).toHaveProperty('post_pr.example');
    });

    it('should have pre_pr.example content matching EXAMPLE_PRE_PR', () => {
      expect(EXAMPLE_HOOKS['pre_pr.example']).toBe(EXAMPLE_PRE_PR);
    });

    it('should have post_pr.example content matching EXAMPLE_POST_PR', () => {
      expect(EXAMPLE_HOOKS['post_pr.example']).toBe(EXAMPLE_POST_PR);
    });

    it('should include all expected example hooks', () => {
      const expectedKeys = [
        'worktree_created.example',
        'run_dev.example',
        'run_test.example',
        'post_merge.example',
        'pre_pr.example',
        'post_pr.example',
      ];
      for (const key of expectedKeys) {
        expect(EXAMPLE_HOOKS).toHaveProperty(key);
      }
    });

    it('should have all examples start with shebang', () => {
      for (const [name, content] of Object.entries(EXAMPLE_HOOKS)) {
        expect(content, `${name} should start with shebang`).toMatch(/^#!/);
      }
    });
  });
});
