#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticPath = join(__dirname, 'src/server/static.ts');

const content = readFileSync(staticPath, 'utf-8');

// Extract CSS
const cssMatch = content.match(/export function getDashboardCss\(\): string \{\s*return `([^`]*)`/s);
if (cssMatch) {
  const css = cssMatch[1];
  writeFileSync(join(__dirname, 'frontend/src/styles.css'), css);
  console.log('✓ Extracted styles.css');
}

// Extract Dashboard JS - this is trickier because of nested backticks
const jsStartMatch = content.match(/export function getDashboardJs\(\): string \{/);
if (jsStartMatch) {
  const startIndex = jsStartMatch.index + jsStartMatch[0].length;
  let depth = 0;
  let inString = false;
  let foundReturn = false;
  let templateStart = -1;
  let i = startIndex;

  // Find the return ` start
  while (i < content.length) {
    if (content.slice(i, i + 8) === 'return `') {
      templateStart = i + 8;
      foundReturn = true;
      break;
    }
    i++;
  }

  if (foundReturn && templateStart > 0) {
    // Now find matching closing backtick
    i = templateStart;
    while (i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      // Check for escaped backtick
      if (char === '\\' && nextChar === '`') {
        i += 2;
        continue;
      }

      // Check for template literal
      if (char === '`' && content[i - 1] !== '\\') {
        // Found potential end
        const afterBacktick = content.slice(i + 1, i + 3);
        if (afterBacktick === ';\n' || afterBacktick === ';\r') {
          const js = content.slice(templateStart, i);
          writeFileSync(join(__dirname, 'frontend/extracted-dashboard.js'), js);
          console.log('✓ Extracted dashboard JS');
          break;
        }
      }
      i++;
    }
  }
}

// Extract Terminal JS similarly
const termJsMatch = content.match(/export function getTerminalJs\(\): string \{\s*return `([^]*?)`;\s*\}/s);
if (termJsMatch) {
  const termJs = termJsMatch[1];
  writeFileSync(join(__dirname, 'frontend/extracted-terminal.js'), termJs);
  console.log('✓ Extracted terminal JS');
}

console.log('\nDone! Check frontend/ directory for extracted files.');
