#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the extracted dashboard JS
const dashboardJs = readFileSync(join(__dirname, 'frontend/extracted-dashboard.js'), 'utf-8');

// Find the template section
const templateMatch = dashboardJs.match(/template: `([^]*?)`(?=,\s*(?:computed|methods|mounted))/s);
const template = templateMatch ? templateMatch[1] : '';

// Find the data section
const dataMatch = dashboardJs.match(/data\(\) \{[^]*?return \{([^]*?)\};[^]*?\}/s);
const dataContent = dataMatch ? dataMatch[1] : '';

// Find the computed section
const computedMatch = dashboardJs.match(/computed: \{([^]*?)\}(?=,\s*methods)/s);
const computed = computedMatch ? computedMatch[1] : '';

// Find the methods section
const methodsMatch = dashboardJs.match(/methods: \{([^]*?)\}(?=,\s*mounted)/s);
const methods = methodsMatch ? methodsMatch[1] : '';

// Find the mounted section
const mountedMatch = dashboardJs.match(/mounted\(\) \{([^]*?)\}(?=\s*\}\);)/s);
const mounted = mountedMatch ? mountedMatch[1] : '';

// Clean template (remove excessive escaping)
const cleanTemplate = template
  .replace(/\\`/g, '`')
  .replace(/\\'/g, "'")
  .replace(/\\\$/g, '$');

console.log('Template lines:', cleanTemplate.split('\n').length);
console.log('Data props:', dataContent.split('\n').filter(l => l.trim()).length);
console.log('Methods found:', methods ? 'yes' : 'no');
console.log('Mounted found:', mounted ? 'yes' : 'no');

// For now, write them to separate files for inspection
writeFileSync(join(__dirname, 'frontend/dashboard-template.html'), cleanTemplate);
writeFileSync(join(__dirname, 'frontend/dashboard-data.js'), dataContent);
writeFileSync(join(__dirname, 'frontend/dashboard-methods.js'), methods || '// No methods found');
writeFileSync(join(__dirname, 'frontend/dashboard-mounted.js'), mounted || '// No mounted found');

console.log('\nExtracted Vue parts to separate files for review.');
