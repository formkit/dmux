/**
 * Action Input Dialog
 *
 * Renders an input dialog from the action system
 */

import React from 'react';
import { Box, Text } from 'ink';
import CleanTextInput from '../inputs/CleanTextInput.js';
import { COLORS } from '../theme/colors.js';
import chalk from 'chalk';

interface ActionInputDialogProps {
  title: string;
  message: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Colorize git diff stat output
 * Example: " src/file.ts | 10 ++--" -> colorizes + and -
 */
function colorizeDiffStat(text: string): string {
  // Match lines with file stats (e.g., "file.ts | 10 ++--")
  return text.split('\n').map(line => {
    // Check if line contains diff markers
    if (line.includes('|')) {
      // Split by | to separate file path from changes
      const parts = line.split('|');
      if (parts.length === 2) {
        const filePart = parts[0];
        const statPart = parts[1];

        // Colorize + and - in the stat part
        const colorizedStat = statPart
          .replace(/\+/g, chalk.green('+'))
          .replace(/-/g, chalk.red('-'));

        return filePart + chalk.dim('|') + colorizedStat;
      }
    }
    return line;
  }).join('\n');
}

const ActionInputDialog: React.FC<ActionInputDialogProps> = ({
  title,
  message,
  placeholder = '',
  value,
  onValueChange
}) => {
  // Check if message contains "Files changed:" section for colorization
  const hasFilesChanged = message.includes('Files changed:');
  const colorizedMessage = hasFilesChanged ? colorizeDiffStat(message) : message;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={COLORS.accent}
      paddingX={1}
      marginTop={1}
    >
      <Box marginBottom={1}>
        <Text bold color={COLORS.accent}>{title}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{colorizedMessage}</Text>
      </Box>

      <Box marginTop={1}>
        <CleanTextInput
          value={value}
          onChange={onValueChange}
          placeholder={placeholder}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter to submit • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

export default ActionInputDialog;
