#!/usr/bin/env node
/**
 * Keyboard Shortcuts Popup - Shows all available keyboard shortcuts
 */

import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { PopupWrapper } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';

interface ShortcutsPopupAppProps {
  resultFile: string;
  hasSidebarLayout: boolean;
}

const ShortcutsPopupApp: React.FC<ShortcutsPopupAppProps> = ({
  resultFile,
  hasSidebarLayout,
}) => {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?') {
      try {
        fs.writeFileSync(resultFile, JSON.stringify({ closed: true }));
      } catch (error) {
        console.error('[shortcutsPopup] Failed to write result file:', error);
      }
      exit();
    }
  });

  const shortcuts = [
    { key: 'j', description: 'Jump to selected pane' },
    { key: 'm', description: 'Open kebab menu for selected pane' },
    { key: 'x', description: 'Close selected pane' },
    { key: 'n', description: 'Create new pane (main project)' },
    { key: 't', description: 'Create terminal pane (main project)' },
    { key: 'p', description: 'Create pane in another project' },
    { key: 'N', description: 'Create pane in another project (legacy)' },
    { key: 'r', description: 'Reopen closed worktree' },
    { key: 'l', description: 'View logs' },
    { key: 's', description: 'Open settings' },
    ...(hasSidebarLayout ? [{ key: 'L', description: 'Toggle sidebar layout' }] : []),
    { key: 'q', description: 'Quit dmux (Ctrl+C twice)' },
    { key: '↑↓←→', description: 'Navigate panes spatially' },
    { key: 'Enter', description: 'Select highlighted item' },
    { key: 'Esc', description: 'Cancel/close dialog' },
    { key: '?', description: 'Show this help' },
  ];

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={POPUP_CONFIG.titleColor}>Keyboard Shortcuts</Text>
        </Box>

        {shortcuts.map((shortcut, index) => (
          <Box key={index} marginBottom={0}>
            <Box width={12}>
              <Text color="yellow" bold>[{shortcut.key}]</Text>
            </Box>
            <Text>{shortcut.description}</Text>
          </Box>
        ))}

        <Box marginTop={1}>
          <Text dimColor>Press Esc or ? to close</Text>
        </Box>
      </Box>
    </PopupWrapper>
  );
};

// Main entry point
const main = async () => {
  const resultFile = process.argv[2];
  if (!resultFile) {
    console.error('Error: Result file path required');
    process.exit(1);
  }

  const dataFile = process.argv[3];
  if (!dataFile) {
    console.error('Error: Data file path required');
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    render(<ShortcutsPopupApp
      resultFile={resultFile}
      hasSidebarLayout={data.hasSidebarLayout || false}
    />);
  } catch (error) {
    console.error('Failed to read data file:', error);
    process.exit(1);
  }
};

main();
