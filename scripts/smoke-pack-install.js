#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distIndexPath = path.join(projectRoot, 'dist', 'index.js');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmux-smoke-'));
const installDir = path.join(tempRoot, 'install');

let tarballName = '';
let tarballPath = '';

function run(command, cwd, stdio = 'pipe') {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    stdio,
  });
}

try {
  fs.mkdirSync(installDir, { recursive: true });

  if (!fs.existsSync(distIndexPath)) {
    run('pnpm run build', projectRoot, 'inherit');
  }

  const packOutput = run('npm pack --silent', projectRoot, 'pipe').trim();
  tarballName = packOutput.split('\n').filter(Boolean).pop() || '';
  if (!tarballName) {
    throw new Error(`Unable to determine tarball from npm pack output: ${packOutput}`);
  }
  tarballPath = path.join(projectRoot, tarballName);

  run('npm init -y > /dev/null', installDir, 'inherit');
  run(`npm install --no-audit --no-fund "${tarballPath}"`, installDir, 'inherit');
  run(
    "node -e \"const fs=require('fs'); const path=require('path'); const pkg=require('dmux/package.json'); const root=path.dirname(require.resolve('dmux/package.json')); const mainPath=path.join(root, pkg.main.replace(/^\\.\\//, '')); if (!fs.existsSync(mainPath)) { console.error('Missing package main:', mainPath); process.exit(1); } console.log('dmux package smoke passed:', mainPath);\"",
    installDir,
    'inherit'
  );
} finally {
  if (tarballPath) {
    fs.rmSync(tarballPath, { force: true });
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
