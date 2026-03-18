import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { supportsRuntimeHelperSourceBuild } from '../src/services/DmuxFocusService.js';

describe('supportsRuntimeHelperSourceBuild', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns false for packaged installs without the source tree', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-packaged-'));
    tempDirs.push(packageRoot);

    expect(supportsRuntimeHelperSourceBuild(packageRoot)).toBe(false);
  });

  it('returns true for source checkouts that include the service source file', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-source-'));
    tempDirs.push(packageRoot);

    const focusServicePath = path.join(packageRoot, 'src', 'services', 'DmuxFocusService.ts');
    fs.mkdirSync(path.dirname(focusServicePath), { recursive: true });
    fs.writeFileSync(focusServicePath, '// test\n', 'utf-8');

    expect(supportsRuntimeHelperSourceBuild(packageRoot)).toBe(true);
  });
});
