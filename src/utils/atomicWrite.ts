import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

/**
 * Atomically writes content to a file using write-and-rename pattern
 * This prevents readers from seeing partial/incomplete data
 *
 * @param filePath - The target file path
 * @param content - The content to write
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  // Create a temporary file in the same directory (ensures same filesystem)
  const dir = path.dirname(filePath);
  const tempSuffix = randomBytes(8).toString('hex');
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${tempSuffix}.tmp`);

  try {
    // Write to temp file
    fs.writeFileSync(tempPath, content, 'utf-8');

    // Atomically rename temp file to target file
    // On POSIX systems, rename() is atomic and will replace the target
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Atomically writes content to a file using write-and-rename pattern (async)
 * This prevents readers from seeing partial/incomplete data
 *
 * @param filePath - The target file path
 * @param content - The content to write
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  // Create a temporary file in the same directory (ensures same filesystem)
  const dir = path.dirname(filePath);
  const tempSuffix = randomBytes(8).toString('hex');
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${tempSuffix}.tmp`);

  try {
    // Write to temp file
    await fsPromises.writeFile(tempPath, content, 'utf-8');

    // Atomically rename temp file to target file
    // On POSIX systems, rename() is atomic and will replace the target
    await fsPromises.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fsPromises.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Atomically writes a JSON object to a file (sync)
 *
 * @param filePath - The target file path
 * @param data - The data to serialize and write
 * @param pretty - Whether to pretty-print the JSON (default: true)
 */
export function atomicWriteJsonSync(filePath: string, data: any, pretty: boolean = true): void {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  atomicWriteFileSync(filePath, content);
}

/**
 * Atomically writes a JSON object to a file (async)
 *
 * @param filePath - The target file path
 * @param data - The data to serialize and write
 * @param pretty - Whether to pretty-print the JSON (default: true)
 */
export async function atomicWriteJson(filePath: string, data: any, pretty: boolean = true): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await atomicWriteFile(filePath, content);
}
