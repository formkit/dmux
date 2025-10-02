/**
 * Action Confirm Dialog
 *
 * Renders a confirmation dialog from the action system
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ActionConfirmDialogProps {
  title: string;
  message: string;
  yesLabel: string;
  noLabel: string;
}

const ActionConfirmDialog: React.FC<ActionConfirmDialogProps> = ({
  title,
  message,
  yesLabel,
  noLabel
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
        <Text>
          <Text color="green" bold>[{yesLabel}]</Text>
          <Text> / </Text>
          <Text color="red">[{noLabel}]</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>y = yes • n = no • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

export default ActionConfirmDialog;
