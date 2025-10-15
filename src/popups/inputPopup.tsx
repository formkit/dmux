#!/usr/bin/env node

/**
 * Standalone popup for text input dialogs
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import * as fs from 'fs';
import CleanTextInput from '../CleanTextInput.js';
import { PopupContainer, PopupInputBox, PopupWrapper, writeSuccessAndExit } from './components/index.js';
import { PopupFooters } from './config.js';

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

  const handleSubmit = (submittedValue?: string) => {
    writeSuccessAndExit(resultFile, submittedValue || value, exit);
  };

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.input()}>
        {/* Message */}
        <Box marginBottom={1}>
          <Text>{message}</Text>
        </Box>

        {/* Input with themed border */}
        <Box marginBottom={1}>
          <PopupInputBox>
            <CleanTextInput
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
              placeholder={placeholder}
            />
          </PopupInputBox>
        </Box>

        {/* Help text */}
        <Box>
          <Text dimColor italic>💡 Tip: Shift+Enter for multi-line</Text>
        </Box>
      </PopupContainer>
    </PopupWrapper>
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
