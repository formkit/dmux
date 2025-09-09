import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export const detectPackageManager = async (): Promise<{ manager: string | null, hasPackageJson: boolean }> => {
  try {
    const projectRoot = execSync('git rev-parse --show-toplevel', { 
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();

    try {
      await fs.access(path.join(projectRoot, 'package.json'));
      const files = await fs.readdir(projectRoot);

      if (files.includes('pnpm-lock.yaml')) return { manager: 'pnpm', hasPackageJson: true };
      if (files.includes('yarn.lock')) return { manager: 'yarn', hasPackageJson: true };
      if (files.includes('package-lock.json')) return { manager: 'npm', hasPackageJson: true };
      return { manager: 'npm', hasPackageJson: true };
    } catch {
      return { manager: null, hasPackageJson: false };
    }
  } catch {
    return { manager: null, hasPackageJson: false };
  }
};

export const suggestCommand = async (type: 'test' | 'dev'): Promise<string | null> => {
  const { manager, hasPackageJson } = await detectPackageManager();
  if (!hasPackageJson) return null;
  return type === 'test' ? `${manager} run test` : `${manager} run dev`;
};
