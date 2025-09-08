import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import CleanTextInput from './dist/CleanTextInput.js';

const TestWrapping = () => {
  const [value, setValue] = useState('');
  const { exit } = useApp();
  const { stdout } = useStdout();
  
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const width = stdout ? stdout.columns : 80;

  return (
    <Box flexDirection="column">
      <Text bold>Test Word Wrapping (Terminal width: {width})</Text>
      
      <Box marginTop={1} borderStyle="round" borderColor="#E67E22" paddingX={1}>
        <CleanTextInput
          value={value}
          onChange={setValue}
          placeholder="Type to test wrapping..."
        />
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text>Debug Info:</Text>
        <Text dimColor>Value length: {value.length}</Text>
        <Text dimColor>Terminal width: {width}</Text>
        <Text dimColor>Available width: {width - 6} (width - borders - padding - prompt)</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Type a long sentence to see wrapping behavior</Text>
      </Box>
    </Box>
  );
};

render(<TestWrapping />);