#!/usr/bin/env tsx
import React, { useState } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text, useInput, useFocus } from 'ink';

const TestFocus = () => {
  const { isFocused } = useFocus({ autoFocus: true });
  const [value, setValue] = useState('');
  
  useInput((input) => {
    console.log('useInput called, isFocused:', isFocused, 'input:', input);
    if (!isFocused) {
      console.log('Not focused, ignoring input');
      return;
    }
    setValue(prev => prev + input);
  });
  
  return (
    <Box>
      <Text>Focused: {isFocused ? 'YES' : 'NO'}</Text>
      <Text>Value: {value}</Text>
    </Box>
  );
};

const { stdin } = render(<TestFocus />);

setTimeout(() => {
  console.log('Writing hello...');
  stdin.write('hello');
}, 100);

setTimeout(() => {
  console.log('Done');
  process.exit(0);
}, 300);