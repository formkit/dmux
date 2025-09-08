import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import CleanTextInput from './dist/CleanTextInput.js';

const TestCtrlAE = () => {
  const [value, setValue] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    
    // Log Ctrl-A and Ctrl-E for debugging
    if (key.ctrl && (input === 'a' || input === 'e')) {
      setLog(prev => [...prev.slice(-4), `Ctrl-${input.toUpperCase()} pressed`]);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>Test Ctrl-A and Ctrl-E</Text>
      
      <Box marginTop={1}>
        <CleanTextInput
          value={value}
          onChange={setValue}
          placeholder="Type some text..."
        />
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text>Instructions:</Text>
        <Text dimColor>1. Type some text</Text>
        <Text dimColor>2. Press Ctrl-A to jump to start of line</Text>
        <Text dimColor>3. Press Ctrl-E to jump to end of line</Text>
        <Text dimColor>4. Try with multiline text (Enter for new line)</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>Current value: "{value.replace(/\n/g, '\\n')}"</Text>
      </Box>

      {log.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text>Log:</Text>
          {log.map((l, i) => <Text key={i} dimColor>{l}</Text>)}
        </Box>
      )}
    </Box>
  );
};

render(<TestCtrlAE />);