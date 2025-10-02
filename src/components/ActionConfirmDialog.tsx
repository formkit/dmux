/**
 * Action Confirm Dialog
 *
 * Renders a confirmation dialog from the action system with selectable options
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ActionConfirmDialogProps {
  title: string;
  message: string;
  yesLabel: string;
  noLabel: string;
  selectedIndex?: number;
}

const ActionConfirmDialog: React.FC<ActionConfirmDialogProps> = ({
  title,
  message,
  yesLabel,
  noLabel,
  selectedIndex = 0
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

      <Box flexDirection="column" marginTop={1} gap={1}>
        {/* Yes option */}
        <Box>
          {selectedIndex === 0 ? (
            <Text color="green" bold inverse>
              {'► '}{yesLabel}{' '}
            </Text>
          ) : (
            <Text>
              {'  '}{yesLabel}
            </Text>
          )}
        </Box>

        {/* No option */}
        <Box>
          {selectedIndex === 1 ? (
            <Text color="red" bold inverse>
              {'► '}{noLabel}{' '}
            </Text>
          ) : (
            <Text>
              {'  '}{noLabel}
            </Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ to navigate • Enter to select • y/n shortcuts • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

export default ActionConfirmDialog;
