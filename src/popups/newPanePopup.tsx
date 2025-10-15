#!/usr/bin/env node

/**
 * Standalone popup for creating a new dmux pane
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import CleanTextInput from '../CleanTextInput.js';
import { PopupContainer, PopupInputBox, PopupWrapper, writeSuccessAndExit } from './components/index.js';
import { PopupFooters } from './config.js';

const NewPanePopupApp: React.FC<{ resultFile: string }> = ({ resultFile }) => {
  const [prompt, setPrompt] = useState('');
  const { exit } = useApp();

  const handleSubmit = (value?: string) => {
    writeSuccessAndExit(resultFile, value || prompt, exit);
  };

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.input()}>
        {/* Instructions */}
        <Box marginBottom={1}>
          <Text dimColor>
            Enter a prompt for your AI agent.
          </Text>
        </Box>

        {/* Input area with themed border */}
        <Box marginBottom={1}>
          <PopupInputBox>
            <CleanTextInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              placeholder="e.g., Add user authentication with JWT"
            />
          </PopupInputBox>
        </Box>

        {/* Tip */}
        <Box>
          <Text dimColor italic>
            💡 Tip: Use Shift+Enter for multi-line prompts
          </Text>
        </Box>
      </PopupContainer>
    </PopupWrapper>
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
