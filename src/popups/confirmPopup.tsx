#!/usr/bin/env node

/**
 * Standalone popup for confirmation dialogs
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';

interface PopupResult {
  success: boolean;
  data?: boolean; // true = yes, false = no
  cancelled?: boolean;
}

interface ConfirmPopupProps {
  resultFile: string;
  title: string;
  message: string;
  yesLabel?: string;
  noLabel?: string;
}

const ConfirmPopupApp: React.FC<ConfirmPopupProps> = ({
  resultFile,
  title,
  message,
  yesLabel = 'Yes',
  noLabel = 'No'
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape) {
      // User cancelled - treat as "No"
      const result: PopupResult = {
        success: true,
        data: false,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    } else if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(1, selectedIndex + 1));
    } else if (key.return) {
      // User confirmed choice
      const result: PopupResult = {
        success: true,
        data: selectedIndex === 0, // 0 = yes, 1 = no
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    } else if (input === 'y' || input === 'Y') {
      // Shortcut: yes
      const result: PopupResult = {
        success: true,
        data: true,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    } else if (input === 'n' || input === 'N') {
      // Shortcut: no
      const result: PopupResult = {
        success: true,
        data: false,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    }
  });

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

      {/* Options */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text
            color={selectedIndex === 0 ? 'cyan' : 'white'}
            bold={selectedIndex === 0}
          >
            {selectedIndex === 0 ? '▶ ' : '  '}
            {yesLabel}
          </Text>
        </Box>
        <Box>
          <Text
            color={selectedIndex === 1 ? 'cyan' : 'white'}
            bold={selectedIndex === 1}
          >
            {selectedIndex === 1 ? '▶ ' : '  '}
            {noLabel}
          </Text>
        </Box>
      </Box>

      {/* Help text */}
      <Box>
        <Text dimColor>↑↓ to navigate • y/n shortcuts • Enter to confirm • ESC to cancel</Text>
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
    yesLabel?: string;
    noLabel?: string;
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <ConfirmPopupApp
      resultFile={resultFile}
      title={data.title}
      message={data.message}
      yesLabel={data.yesLabel}
      noLabel={data.noLabel}
    />
  );
}

main();
