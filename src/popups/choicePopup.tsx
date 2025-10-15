#!/usr/bin/env node

/**
 * Standalone popup for choice dialogs
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './components/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';

interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  danger?: boolean;
  default?: boolean;
}

interface ChoicePopupProps {
  resultFile: string;
  title: string;
  message: string;
  options: ChoiceOption[];
}

const ChoicePopupApp: React.FC<ChoicePopupProps> = ({
  resultFile,
  title,
  message,
  options,
}) => {
  // Find default option or start at 0
  const defaultIndex = options.findIndex(o => o.default) || 0;
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, defaultIndex));
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(options.length - 1, selectedIndex + 1));
    } else if (key.return) {
      // User selected an option
      const selectedOption = options[selectedIndex];
      writeSuccessAndExit(resultFile, selectedOption.id, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        {/* Message */}
        {message && (
          <Box marginBottom={1}>
            <Text>{message}</Text>
          </Box>
        )}

        {/* Options */}
        <Box flexDirection="column">
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={option.id} marginBottom={index < options.length - 1 ? 1 : 0}>
                <Box flexDirection="column">
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : option.danger ? POPUP_CONFIG.errorColor : 'white'}
                    bold={isSelected}
                  >
                    {isSelected ? '▶ ' : '  '}
                    {option.label}
                  </Text>
                  {option.description && (
                    <Box marginLeft={3}>
                      <Text dimColor>{option.description}</Text>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
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
    options: ChoiceOption[];
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <ChoicePopupApp
      resultFile={resultFile}
      title={data.title}
      message={data.message}
      options={data.options}
    />
  );
}

main();
