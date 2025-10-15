#!/usr/bin/env node

/**
 * Standalone popup for kebab menu
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import type { ActionMetadata } from '../actions/types.js';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './components/index.js';
import { PopupFooters, POPUP_CONFIG } from './config.js';

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

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(actions.length - 1, selectedIndex + 1));
    } else if (key.return) {
      // User selected an action
      const selectedAction = actions[selectedIndex];
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ENTER pressed, selected: ${selectedAction.id}\n`);
      writeSuccessAndExit(resultFile, selectedAction.id, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.choice()}>
        {/* Action list */}
        {actions.map((action, index) => (
          <Box key={action.id}>
            <Text color={selectedIndex === index ? POPUP_CONFIG.titleColor : 'white'} bold={selectedIndex === index}>
              {selectedIndex === index ? '▶ ' : '  '}
              {action.label}
            </Text>
          </Box>
        ))}
      </PopupContainer>
    </PopupWrapper>
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
