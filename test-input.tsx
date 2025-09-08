#!/usr/bin/env node
import React, { useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import GeminiTextInput from './dist/GeminiTextInput.js';

const TestApp = () => {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Testing Text Input (Ctrl+C to exit)</Text>
      </Box>
      
      <Box borderStyle="round" borderColor="#E67E22" paddingX={1}>
        <GeminiTextInput
          value={value}
          onChange={setValue}
          placeholder="Type your message..."
          onSubmit={() => {
            setSubmitted(value);
            setValue('');
          }}
          onCancel={() => {
            setValue('');
          }}
          multiline={true}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Current value: "{value}"</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Length: {value.length} | Lines: {value.split('\n').length}</Text>
      </Box>

      {submitted && (
        <Box marginTop={1}>
          <Text color="green">Last submitted: "{submitted}"</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Instructions:</Text>
        <Text dimColor>- Type text normally</Text>
        <Text dimColor>- Backspace should delete backwards</Text>
        <Text dimColor>- Delete should delete forwards</Text>
        <Text dimColor>- Enter adds new line</Text>
        <Text dimColor>- Shift+Enter submits</Text>
        <Text dimColor>- Arrow keys navigate</Text>
        <Text dimColor>- ESC clears</Text>
      </Box>
    </Box>
  );
};

render(<TestApp />);