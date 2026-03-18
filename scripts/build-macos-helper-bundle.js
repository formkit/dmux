#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const macosRoot = path.join(projectRoot, 'native', 'macos');
const sourcePath = path.join(macosRoot, 'dmux-helper.swift');
const infoPlistPath = path.join(macosRoot, 'dmux-helper-Info.plist');
const iconSourcePath = path.join(macosRoot, 'dmux-helper-icon.png');
const soundsDir = path.join(macosRoot, 'sounds');
const prebuiltRoot = path.join(macosRoot, 'prebuilt');
const appPath = path.join(prebuiltRoot, 'dmux-helper.app');
const contentsPath = path.join(appPath, 'Contents');
const macOsPath = path.join(contentsPath, 'MacOS');
const resourcesPath = path.join(contentsPath, 'Resources');
const executablePath = path.join(macOsPath, 'dmux-helper');
const iconPngPath = path.join(resourcesPath, 'dmux-helper.png');
const iconIcnsPath = path.join(resourcesPath, 'dmux-helper.icns');
const universalTargets = ['arm64-apple-macos12.0', 'x86_64-apple-macos12.0'];

function runBuildTool(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    ...options,
  });

  return {
    ok: result.status === 0,
    output: (result.stderr || result.stdout || '').trim(),
  };
}

async function buildIcns(iconSource, iconIcns) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dmux-helper-prebuilt-icon-'));
  const iconsetDir = path.join(tempDir, 'dmux-helper.iconset');

  try {
    await fs.mkdir(iconsetDir, { recursive: true });
    const sizes = [16, 32, 128, 256, 512];

    for (const size of sizes) {
      const oneX = path.join(iconsetDir, `icon_${size}x${size}.png`);
      const twoX = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);

      let result = runBuildTool('/usr/bin/sips', [
        '-z',
        String(size),
        String(size),
        iconSource,
        '--out',
        oneX,
      ]);
      if (!result.ok) {
        throw new Error(result.output || 'sips failed building helper icon');
      }

      result = runBuildTool('/usr/bin/sips', [
        '-z',
        String(size * 2),
        String(size * 2),
        iconSource,
        '--out',
        twoX,
      ]);
      if (!result.ok) {
        throw new Error(result.output || 'sips failed building helper icon');
      }
    }

    const iconutilResult = runBuildTool('/usr/bin/iconutil', [
      '-c',
      'icns',
      iconsetDir,
      '-o',
      iconIcns,
    ]);
    if (!iconutilResult.ok) {
      throw new Error(iconutilResult.output || 'iconutil failed building helper icon');
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildUniversalBinary(outputPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dmux-helper-build-'));

  try {
    const archBinaries = [];

    for (const target of universalTargets) {
      const archName = target.split('-')[0];
      const archBinaryPath = path.join(tempDir, `dmux-helper-${archName}`);
      const result = runBuildTool('swiftc', [
        '-O',
        '-target',
        target,
        sourcePath,
        '-o',
        archBinaryPath,
        '-framework',
        'AppKit',
        '-framework',
        'ApplicationServices',
      ]);

      if (!result.ok) {
        throw new Error(`swiftc failed for ${target}: ${result.output}`);
      }

      archBinaries.push(archBinaryPath);
    }

    const lipoResult = runBuildTool('/usr/bin/lipo', [
      '-create',
      '-output',
      outputPath,
      ...archBinaries,
    ]);

    if (!lipoResult.ok) {
      throw new Error(lipoResult.output || 'lipo failed creating universal helper binary');
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('[build:macos-helper] Skipping prebuilt macOS helper bundle on non-macOS host');
    return;
  }

  const requiredPaths = [sourcePath, infoPlistPath, iconSourcePath, soundsDir];
  const missingPath = requiredPaths.find((candidate) => !existsSync(candidate));
  if (missingPath) {
    throw new Error(`Missing helper build input: ${missingPath}`);
  }

  await fs.rm(appPath, { recursive: true, force: true });
  await fs.mkdir(macOsPath, { recursive: true });
  await fs.mkdir(resourcesPath, { recursive: true });

  await fs.copyFile(infoPlistPath, path.join(contentsPath, 'Info.plist'));
  await fs.copyFile(iconSourcePath, iconPngPath);

  try {
    await buildIcns(iconSourcePath, iconIcnsPath);
  } catch (error) {
    console.warn(`[build:macos-helper] ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const fileName of await fs.readdir(soundsDir)) {
    await fs.copyFile(path.join(soundsDir, fileName), path.join(resourcesPath, fileName));
  }

  await buildUniversalBinary(executablePath);
  await fs.chmod(executablePath, 0o755);

  console.log(`[build:macos-helper] Built ${appPath}`);
}

main().catch((error) => {
  console.error(`[build:macos-helper] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
