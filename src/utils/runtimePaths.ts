import path from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

const DIST_ROOT = path.join(PACKAGE_ROOT, 'dist');

export function resolveDistPath(...segments: string[]): string {
  return path.join(DIST_ROOT, ...segments);
}

export function resolvePackagePath(...segments: string[]): string {
  return path.join(PACKAGE_ROOT, ...segments);
}
