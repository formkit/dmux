#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const scripts = packageJson.scripts || {};

const requiredMarkers = {
  dev: 'node dist/index.js',
  'dev:watch:run': 'node scripts/dev-watch-run.js',
};

const disallowedMarkers = [
  'tsx src/index.ts',
  'tsx --watch src/index.ts',
  'jiti src/index.ts',
  'jiti --watch src/index.ts',
  'ts-node src/index.ts',
  'ts-node --watch src/index.ts',
];

const errors = [];

for (const [scriptName, marker] of Object.entries(requiredMarkers)) {
  const scriptValue = scripts[scriptName];
  if (typeof scriptValue !== 'string' || !scriptValue.includes(marker)) {
    errors.push(
      `scripts.${scriptName} must include "${marker}" (current: ${JSON.stringify(scriptValue)})`
    );
  }
}

for (const [scriptName, scriptValue] of Object.entries(scripts)) {
  if (typeof scriptValue !== 'string') continue;

  for (const marker of disallowedMarkers) {
    if (scriptValue.includes(marker)) {
      errors.push(`scripts.${scriptName} includes forbidden source runtime marker "${marker}"`);
    }
  }
}

if (errors.length > 0) {
  console.error('Runtime parity guard failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Runtime parity guard passed.');
