#!/usr/bin/env tsx
import React, { useState } from 'react';
import { render } from 'ink-testing-library';
import CleanTextInput from './dist/CleanTextInput.js';

const TestApp = () => {
  const [value, setValue] = useState('');
  
  console.log('Current value:', value);
  
  return (
    <CleanTextInput 
      value={value} 
      onChange={(v) => {
        console.log('onChange called with:', v);
        setValue(v);
      }} 
    />
  );
};

console.log('Starting test...');
const { stdin } = render(<TestApp />);

// Wait for component to be ready
setTimeout(() => {
  console.log('Typing h...');
  stdin.write('h');
}, 100);

setTimeout(() => {
  console.log('Typing e...');
  stdin.write('e');
}, 200);

setTimeout(() => {
  console.log('Typing llo...');
  stdin.write('llo');
}, 300);

setTimeout(() => {
  console.log('Done');
  process.exit(0);
}, 500);