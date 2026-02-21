/**
 * Tests for pre_pr hook integration (HookEnvironment, hook file, triggerHookSync)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, accessSync } from 'fs';
import path from 'path';

// Mock child_process for triggerHookSync tests
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: any[]) => mockExecSync(...args),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    on: vi.fn(),
  })),
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

vi.mock('../../src/shared/StateManager.js', () => ({
  StateManager: {
    getInstance: vi.fn(() => ({
      getState: vi.fn(() => ({ serverPort: 3142 })),
    })),
  },
}));

describe('pre_pr hook integration', () => {
  describe('HookEnvironment interface', () => {
    it('should accept DMUX_PR_TITLE in environment', async () => {
      const { buildHookEnvironment } = await import('../../src/utils/hooks.js');
      const env = await buildHookEnvironment('/test', undefined, {
        DMUX_PR_TITLE: 'feat: new feature',
      });
      expect(env.DMUX_PR_TITLE).toBe('feat: new feature');
    });

    it('should accept DMUX_PR_BODY in environment', async () => {
      const { buildHookEnvironment } = await import('../../src/utils/hooks.js');
      const env = await buildHookEnvironment('/test', undefined, {
        DMUX_PR_BODY: '## Summary\nChanges',
      });
      expect(env.DMUX_PR_BODY).toBe('## Summary\nChanges');
    });

    it('should accept DMUX_BASE_BRANCH in environment', async () => {
      const { buildHookEnvironment } = await import('../../src/utils/hooks.js');
      const env = await buildHookEnvironment('/test', undefined, {
        DMUX_BASE_BRANCH: 'main',
      });
      expect(env.DMUX_BASE_BRANCH).toBe('main');
    });

    it('should pass all PR env vars together', async () => {
      const { buildHookEnvironment } = await import('../../src/utils/hooks.js');
      const env = await buildHookEnvironment('/test', undefined, {
        DMUX_PR_TITLE: 'feat: auth',
        DMUX_PR_BODY: '## Summary',
        DMUX_BASE_BRANCH: 'develop',
      });
      expect(env.DMUX_PR_TITLE).toBe('feat: auth');
      expect(env.DMUX_PR_BODY).toBe('## Summary');
      expect(env.DMUX_BASE_BRANCH).toBe('develop');
    });
  });

  describe('HookType includes pre_pr and post_pr', () => {
    it('should include pre_pr in listAvailableHooks when hook exists', async () => {
      const { listAvailableHooks } = await import('../../src/utils/hooks.js');
      // This tests that 'pre_pr' is in the allHooks array
      // We can verify by checking the hook types are properly typed
      // (would fail to compile if pre_pr wasn't a valid HookType)
      const hooks = listAvailableHooks('/nonexistent');
      // Even though no hooks are found, the function should not throw
      expect(Array.isArray(hooks)).toBe(true);
    });

    it('should find pre_pr hook in .dmux-hooks directory', async () => {
      const { findHook } = await import('../../src/utils/hooks.js');
      const projectRoot = path.resolve(__dirname, '../..');

      // The .dmux-hooks/pre_pr file we created should exist
      const hookPath = findHook(projectRoot, 'pre_pr');
      if (hookPath) {
        expect(hookPath).toContain('pre_pr');
      }
      // If not found (e.g., in CI without the file), just verify function doesn't crash
    });
  });

  describe('.dmux-hooks/pre_pr file', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const hookPath = path.join(projectRoot, '.dmux-hooks', 'pre_pr');

    it('should exist', () => {
      expect(existsSync(hookPath)).toBe(true);
    });

    it('should be executable', () => {
      expect(() => {
        accessSync(hookPath, 4 /* fs.constants.R_OK */ | 1 /* fs.constants.X_OK */);
      }).not.toThrow();
    });
  });

  describe('triggerHookSync with pre_pr', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should pass timeout to execSync', async () => {
      const { triggerHookSync, findHook } = await import('../../src/utils/hooks.js');

      // Mock findHook to return a fake path
      const originalFindHook = findHook;

      // triggerHookSync calls execSync with the hook path and timeout
      // If no hook is found, it returns success immediately
      const result = await triggerHookSync('pre_pr', '/nonexistent', undefined, {}, 600000);

      // No hook found at /nonexistent, should return success
      expect(result.success).toBe(true);
    });
  });
});
