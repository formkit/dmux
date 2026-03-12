#!/usr/bin/env node

/**
 * Standalone popup for kebab menu
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import type { PaneMenuAction } from '../../actions/types.js';
import { PopupContainer, PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';
import { pathToFileURL } from 'url';

interface KebabMenuPopupProps {
  resultFile: string;
  paneName: string;
  actions: PaneMenuAction[];
}

export const KebabMenuPopupApp: React.FC<KebabMenuPopupProps> = ({ resultFile, paneName, actions }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(selectedIndex <= 0 ? actions.length - 1 : selectedIndex - 1);
    } else if (key.downArrow) {
      setSelectedIndex(selectedIndex >= actions.length - 1 ? 0 : selectedIndex + 1);
    } else if (key.return) {
      // User selected an action
      const selectedAction = actions[selectedIndex];
      writeSuccessAndExit(resultFile, selectedAction.id, exit);
    } else {
      const shortcutAction = actions.find((action) => action.shortcut === input);
      if (shortcutAction) {
        writeSuccessAndExit(resultFile, shortcutAction.id, exit);
      }
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer="↑↓ to navigate • Enter or hotkey to select • ESC to cancel">
        {/* Action list */}
        {actions.map((action, index) => (
          <Box key={action.id} width="100%">
            <Box flexGrow={1}>
              <Text color={selectedIndex === index ? POPUP_CONFIG.titleColor : 'white'} bold={selectedIndex === index}>
                {selectedIndex === index ? '▶ ' : '  '}
                {action.label}
              </Text>
            </Box>
            {action.shortcut ? (
              <Text color="yellow">[{action.shortcut}]</Text>
            ) : null}
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

  let actions: PaneMenuAction[];
  try {
    actions = JSON.parse(actionsJson);
  } catch (error) {
    console.error('Error: Failed to parse actions JSON');
    process.exit(1);
  }

  render(<KebabMenuPopupApp resultFile={resultFile} paneName={paneName} actions={actions} />);
}

const entryPointHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPointHref) {
  main();
}
