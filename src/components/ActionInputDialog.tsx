/**
 * Action Input Dialog
 *
 * Renders an input dialog from the action system
 */

import React from 'react';
import { Box, Text } from 'ink';
import CleanTextInput from '../CleanTextInput.js';

interface ActionInputDialogProps {
  title: string;
  message: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
}

const ActionInputDialog: React.FC<ActionInputDialogProps> = ({
  title,
  message,
  placeholder = '',
  value,
  onValueChange
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginTop={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{message}</Text>
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
