#!/usr/bin/env node

/**
 * Standalone popup for text input dialogs
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import CleanTextInput from '../CleanTextInput.js';

interface PopupResult {
  success: boolean;
  data?: string; // User input value
  cancelled?: boolean;
}

interface InputPopupProps {
  resultFile: string;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

const InputPopupApp: React.FC<InputPopupProps> = ({
  resultFile,
  title,
  message,
  placeholder = '',
  defaultValue = '',
}) => {
  const [value, setValue] = useState(defaultValue);
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

  const handleSubmit = (submittedValue?: string) => {
    const result: PopupResult = {
      success: true,
      data: submittedValue || value,
    };
    fs.writeFileSync(resultFile, JSON.stringify(result));
    exit();
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {title}
        </Text>
      </Box>

      {/* Message */}
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      {/* Input */}
      <Box marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1} paddingY={0}>
        <CleanTextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      </Box>

      {/* Help text */}
      <Box>
        <Text dimColor>Enter to submit • ESC to cancel • Shift+Enter for multi-line</Text>
      </Box>
    </Box>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const dataFile = process.argv[3];

  if (!resultFile || !dataFile) {
    console.error('Error: Result file and data file required');
    process.exit(1);
  }

  let data: {
    title: string;
    message: string;
    placeholder?: string;
    defaultValue?: string;
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <InputPopupApp
      resultFile={resultFile}
      title={data.title}
      message={data.message}
      placeholder={data.placeholder}
      defaultValue={data.defaultValue}
    />
  );
}

main();
