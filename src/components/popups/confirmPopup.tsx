#!/usr/bin/env node

/**
 * Standalone popup for confirmation dialogs
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';

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
      writeSuccessAndExit(resultFile, false, exit);
    } else if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(1, selectedIndex + 1));
    } else if (key.return) {
      // User confirmed choice
      writeSuccessAndExit(resultFile, selectedIndex === 0, exit); // 0 = yes, 1 = no
    } else if (input === 'y' || input === 'Y') {
      // Shortcut: yes
      writeSuccessAndExit(resultFile, true, exit);
    } else if (input === 'n' || input === 'N') {
      // Shortcut: no
      writeSuccessAndExit(resultFile, false, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <PopupContainer footer={PopupFooters.confirm('y', 'n')}>
        {/* Message */}
        <Box marginBottom={1} flexDirection="column">
          {message.split('\n').map((line, idx) => (
            <Text key={idx} wrap="truncate-end">{line}</Text>
          ))}
        </Box>

        {/* Options */}
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text
              color={selectedIndex === 0 ? POPUP_CONFIG.titleColor : 'white'}
              bold={selectedIndex === 0}
            >
              {selectedIndex === 0 ? '▶ ' : '  '}
              {yesLabel}
            </Text>
          </Box>
          <Box>
            <Text
              color={selectedIndex === 1 ? POPUP_CONFIG.titleColor : 'white'}
              bold={selectedIndex === 1}
            >
              {selectedIndex === 1 ? '▶ ' : '  '}
              {noLabel}
            </Text>
          </Box>
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
