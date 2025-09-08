import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import CleanTextInput from './dist/CleanTextInput.js';

const TestApp = () => {
  const [value, setValue] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const { exit } = useApp();

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setLog(prev => [...prev, `Value: "${newValue}" Length: ${newValue.length}`]);
  };

  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>Test Cursor Tracking</Text>
      <Box marginTop={1}>
        <CleanTextInput
          value={value}
          onChange={handleChange}
          onSubmit={() => exit()}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {log.slice(-5).map((l, i) => (
          <Text key={i} dimColor>{l}</Text>
        ))}
      </Box>
    </Box>
  );
};

render(<TestApp />);