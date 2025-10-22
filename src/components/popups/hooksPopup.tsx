#!/usr/bin/env node

/**
 * Standalone popup for managing hooks
 * Runs in a tmux popup modal and writes result to a file
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { PopupWrapper, writeSuccessAndExit } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';

interface Hook {
  name: string;
  active: boolean;
}

interface HooksPopupProps {
  resultFile: string;
  hooks: Hook[];
}

const HooksPopupApp: React.FC<HooksPopupProps> = ({ resultFile, hooks }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(hooks.length, selectedIndex + 1));
    } else if (key.return || input === 'e') {
      // Edit hooks using an agent
      writeSuccessAndExit(resultFile, { action: 'edit' }, exit);
    } else if (input === 'v') {
      // View hooks in editor
      writeSuccessAndExit(resultFile, { action: 'view' }, exit);
    }
  });

  return (
    <PopupWrapper resultFile={resultFile}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        {/* Hooks list */}
        <Box flexDirection="column" marginBottom={1}>
          {hooks.map((hook, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={hook.name}>
                <Text color={isSelected ? POPUP_CONFIG.titleColor : 'white'} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  {hook.active ? '✓' : '○'} {hook.name}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Actions */}
        <Box marginTop={1} marginBottom={1} paddingY={1} borderStyle="bold" borderColor={POPUP_CONFIG.borderColor}>
          <Box flexDirection="column" paddingX={1}>
            <Text color={POPUP_CONFIG.titleColor} bold>
              Actions:
            </Text>
            <Text>
              <Text color="green" bold>e</Text> - Edit hooks with AI agent
            </Text>
            <Text>
              <Text color="green" bold>v</Text> - View hooks file in editor
            </Text>
          </Box>
        </Box>

        <Box>
          <Text dimColor>↑↓ to navigate • e/v for actions • ESC to back</Text>
        </Box>
      </Box>
    </PopupWrapper>
  );
};

// Entry point
function main() {
  const resultFile = process.argv[2];
  const hooksJson = process.argv[3];

  if (!resultFile || !hooksJson) {
    console.error('Error: Result file and hooks JSON required');
    process.exit(1);
  }

  let hooks: Hook[];
  try {
    hooks = JSON.parse(hooksJson);
  } catch (error) {
    console.error('Error: Failed to parse hooks JSON');
    process.exit(1);
  }

  render(<HooksPopupApp resultFile={resultFile} hooks={hooks} />);
}

main();
