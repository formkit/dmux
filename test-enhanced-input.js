#!/usr/bin/env node
import React from 'react';
import { render, Box, Text } from 'ink';
import EnhancedTextInput from './dist/EnhancedTextInput.js';

const TestApp = () => {
  const [value, setValue] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  if (submitted) {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Submitted text:</Text>
        <Text>{value}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Testing Enhanced Text Input</Text>
      <Text dimColor>Try these features:</Text>
      <Text dimColor>• Ctrl+A: Start of line</Text>
      <Text dimColor>• Ctrl+E: End of line</Text>
      <Text dimColor>• Alt+←/→: Jump words</Text>
      <Text dimColor>• @: File autocomplete</Text>
      <Text dimColor>• Enter: Submit, Esc: Cancel</Text>
      <Box marginTop={1}>
        <EnhancedTextInput
          value={value}
          onChange={setValue}
          placeholder="Type here... (@ for files)"
          onSubmit={() => setSubmitted(true)}
          onCancel={() => process.exit(0)}
          multiline={true}
        />
      </Box>
    </Box>
  );
};

const app = render(<TestApp />);