#!/usr/bin/env node

import { PaneAnalyzer } from './dist/PaneAnalyzer.js';

async function test() {
  const analyzer = new PaneAnalyzer();

  // Get the Claude pane ID
  const paneId = '%4';

  console.log('Testing PaneAnalyzer with pane:', paneId);
  const analysis = await analyzer.analyzePane(paneId);

  console.log('\nFinal Analysis Result:');
  console.log(JSON.stringify(analysis, null, 2));
}

test().catch(console.error);