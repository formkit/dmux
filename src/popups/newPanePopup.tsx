#!/usr/bin/env node

/**
 * Standalone popup for creating a new dmux pane
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import CleanTextInput from '../CleanTextInput.js';

interface PopupResult {
  success: boolean;
  data?: string;
  cancelled?: boolean;
}

const NewPanePopupApp: React.FC<{ resultFile: string }> = ({ resultFile }) => {
  const [prompt, setPrompt] = useState('');
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) {
      // User cancelled
      const result: PopupResult = {
        success: false,
        cancelled: true,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    }
  });

  const handleSubmit = (value?: string) => {
    const result: PopupResult = {
      success: true,
      data: value || prompt,
    };
    fs.writeFileSync(resultFile, JSON.stringify(result));
    exit();
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create New Pane
        </Text>
      </Box>

      {/* Instructions */}
      <Box marginBottom={1}>
        <Text dimColor>
          Enter a prompt for your AI agent. Press <Text color="green">Enter</Text> to create,{' '}
          <Text color="red">ESC</Text> to cancel.
        </Text>
      </Box>

      {/* Input area with border */}
      <Box marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1} paddingY={0}>
        <CleanTextInput
          value={prompt}
          onChange={setPrompt}
          onSubmit={handleSubmit}
          placeholder="e.g., Add user authentication with JWT"
        />
      </Box>

      {/* Footer hint */}
      <Box>
        <Text dimColor italic>
          💡 Tip: Use Shift+Enter for multi-line prompts
        </Text>
      </Box>
    </Box>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];

  if (!resultFile) {
    console.error('Error: Result file path required');
    process.exit(1);
  }

  render(<NewPanePopupApp resultFile={resultFile} />);
}

main();
