import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyGitProject,
  inspectProjectCreationTarget,
} from '../src/utils/projectRoot.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dmux-project-root-'));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('projectRoot project creation', () => {
  it('creates a new empty git repository when the target path does not exist', () => {
    const tempDir = makeTempDir();
    const projectPath = path.join(tempDir, 'projects', 'new-app');

    const created = createEmptyGitProject(projectPath);

    expect(created.projectRoot).toBe(projectPath);
    expect(created.projectName).toBe('new-app');
    expect(existsSync(path.join(projectPath, '.git'))).toBe(true);
  });

  it('initializes an existing empty directory as a git repository', () => {
    const tempDir = makeTempDir();
    const projectPath = path.join(tempDir, 'empty-app');
    mkdirSync(projectPath, { recursive: true });

    const target = inspectProjectCreationTarget(projectPath);
    expect(target.state).toBe('empty_directory');

    const created = createEmptyGitProject(projectPath);

    expect(created.projectRoot).toBe(projectPath);
    expect(existsSync(path.join(projectPath, '.git'))).toBe(true);
  });

  it('rejects existing non-empty directories', () => {
    const tempDir = makeTempDir();
    const projectPath = path.join(tempDir, 'non-empty-app');
    mkdirSync(projectPath, { recursive: true });
    writeFileSync(path.join(projectPath, 'README.md'), '# existing\n', 'utf-8');

    const target = inspectProjectCreationTarget(projectPath);
    expect(target.state).toBe('directory_not_empty');

    expect(() => createEmptyGitProject(projectPath)).toThrow(
      `Directory is not empty: ${projectPath}. New projects can only be created in an empty directory.`
    );
    expect(existsSync(path.join(projectPath, '.git'))).toBe(false);
  });
});
