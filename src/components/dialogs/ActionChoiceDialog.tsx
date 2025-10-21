/**
 * Action Choice Dialog
 *
 * Renders a choice dialog from the action system
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ActionOption } from '../../actions/types.js';

interface ActionChoiceDialogProps {
  title: string;
  message: string;
  options: ActionOption[];
  selectedIndex: number;
}

const ActionChoiceDialog: React.FC<ActionChoiceDialogProps> = ({
  title,
  message,
  options,
  selectedIndex
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

      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        const color = option.danger ? 'red' : isSelected ? 'cyan' : 'white';

        return (
          <Box key={option.id}>
            <Text color={color} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
              {option.label}
              {option.description && <Text dimColor> - {option.description}</Text>}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

export default ActionChoiceDialog;
