#!/usr/bin/env tsx
import React, { useState } from 'react';
import { render } from 'ink-testing-library';
import CleanTextInput from './src/CleanTextInput.js';

console.log('VITEST env:', process.env.VITEST);
console.log('NODE_ENV:', process.env.NODE_ENV);

const TestApp = () => {
  const [value, setValue] = useState('');
  
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

const { stdin } = render(<TestApp />);

setTimeout(() => {
  console.log('Typing hello...');
  stdin.write('hello');
}, 100);

setTimeout(() => {
  console.log('Done');
  process.exit(0);
}, 500);