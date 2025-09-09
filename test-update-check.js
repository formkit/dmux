#!/usr/bin/env node

// Test that the update check doesn't block
console.log('Starting update check test...');

const startTime = Date.now();
let inputReceived = false;

// Simulate immediate input availability
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (key) => {
  inputReceived = true;
  const elapsed = Date.now() - startTime;
  console.log(`Input received after ${elapsed}ms`);
  
  if (key === '\u0003') { // Ctrl+C
    process.exit();
  }
});

// Import and run the dmux app to test
import('./dist/index.js').then(module => {
  console.log('dmux loaded, type something to test input responsiveness...');
  console.log('Press Ctrl+C to exit');
  
  // Check responsiveness after a short delay
  setTimeout(() => {
    if (!inputReceived) {
      console.log('Warning: No input received within 100ms');
    } else {
      console.log('Success: Input was responsive!');
    }
  }, 100);
}).catch(err => {
  console.error('Failed to load dmux:', err);
  process.exit(1);
});