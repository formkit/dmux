import { describe, it, expect } from 'vitest';
import { suggestCommand } from '../src/utils/commands.js';

describe('commands utils', () => {
  it('suggests test/dev commands based on lockfile', async () => {
    const testCmd = await suggestCommand('test');
    const devCmd = await suggestCommand('dev');
    expect(testCmd).toBeTruthy();
    expect(devCmd).toBeTruthy();
    // In this repo we have package-lock.json, so expect npm
    expect(testCmd).toContain('npm');
    expect(devCmd).toContain('npm');
  });
});
