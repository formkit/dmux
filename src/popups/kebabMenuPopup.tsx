#!/usr/bin/env node

/**
 * Standalone popup for kebab menu
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import type { ActionMetadata } from '../actions/types.js';

interface PopupResult {
  success: boolean;
  data?: string; // Action ID
  cancelled?: boolean;
}

interface KebabMenuPopupProps {
  resultFile: string;
  paneName: string;
  actions: ActionMetadata[];
}

const KebabMenuPopupApp: React.FC<KebabMenuPopupProps> = ({ resultFile, paneName, actions }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  // Log that we mounted
  useEffect(() => {
    const logFile = '/tmp/dmux-kebab-debug.log';
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Kebab menu mounted with ${actions.length} actions\n`);
    return () => {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] Kebab menu unmounting\n`);
    };
  }, []);

  useInput((input, key) => {
    const logFile = '/tmp/dmux-kebab-debug.log';
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Input: "${input}", escape: ${key.escape}, return: ${key.return}\n`);

    if (key.escape) {
      // User cancelled
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ESC pressed, cancelling\n`);
      const result: PopupResult = {
        success: false,
        cancelled: true,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    } else if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(actions.length - 1, selectedIndex + 1));
    } else if (key.return) {
      // User selected an action
      const selectedAction = actions[selectedIndex];
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ENTER pressed, selected: ${selectedAction.id}\n`);
      const result: PopupResult = {
        success: true,
        data: selectedAction.id,
      };
      fs.writeFileSync(resultFile, JSON.stringify(result));
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Action list */}
      {actions.map((action, index) => (
        <Box key={action.id}>
          <Text color={selectedIndex === index ? 'cyan' : 'white'} bold={selectedIndex === index}>
            {selectedIndex === index ? '▶ ' : '  '}
            {action.label}
          </Text>
        </Box>
      ))}

      {/* Footer hint */}
      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const paneName = process.argv[3];
  const actionsJson = process.argv[4];

  if (!resultFile || !paneName || !actionsJson) {
    console.error('Error: Result file, pane name, and actions JSON required');
    process.exit(1);
  }

  let actions: ActionMetadata[];
  try {
    actions = JSON.parse(actionsJson);
  } catch (error) {
    console.error('Error: Failed to parse actions JSON');
    process.exit(1);
  }

  render(<KebabMenuPopupApp resultFile={resultFile} paneName={paneName} actions={actions} />);
}

main();
