#!/usr/bin/env node

/**
 * Standalone popup for progress/status messages
 * Runs in a tmux popup modal and writes result to a file
 * This popup auto-closes after a timeout
 */

import React, { useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import * as fs from 'fs';

interface ProgressPopupProps {
  resultFile: string;
  message: string;
  type?: 'info' | 'success' | 'error';
  timeout?: number; // Auto-close timeout in ms
}

const ProgressPopupApp: React.FC<ProgressPopupProps> = ({
  resultFile,
  message,
  type = 'info',
  timeout = 0 // 0 means no auto-close
}) => {
  const { exit } = useApp();

  useEffect(() => {
    if (timeout > 0) {
      const timer = setTimeout(() => {
        const result = {
          success: true,
        };
        fs.writeFileSync(resultFile, JSON.stringify(result));
        exit();
      }, timeout);

      return () => clearTimeout(timer);
    }
  }, [timeout, resultFile, exit]);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Message */}
      <Box>
        <Text>{message}</Text>
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
    message: string;
    type?: 'info' | 'success' | 'error';
    timeout?: number;
  };

  try {
    const dataJson = fs.readFileSync(dataFile, 'utf-8');
    data = JSON.parse(dataJson);
  } catch (error) {
    console.error('Error: Failed to read or parse data file');
    process.exit(1);
  }

  render(
    <ProgressPopupApp
      resultFile={resultFile}
      message={data.message}
      type={data.type}
      timeout={data.timeout}
    />
  );
}

main();
