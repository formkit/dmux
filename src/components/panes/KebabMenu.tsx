import React from 'react';
import { Box, Text } from 'ink';
import type { ActionMetadata } from '../../actions/types.js';

interface KebabMenuProps {
  selectedOption: number;
  actions: ActionMetadata[];
  paneName: string;
}

const KebabMenu: React.FC<KebabMenuProps> = ({ selectedOption, actions, paneName }) => {
  const options = actions;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginTop={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Menu: {paneName}</Text>
      </Box>
      {options.map((option, index) => (
        <Box key={option.id}>
          <Text color={selectedOption === index ? 'cyan' : 'white'} bold={selectedOption === index}>
            {selectedOption === index ? '▶ ' : '  '}
            {option.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate • Enter to select • ESC to cancel</Text>
      </Box>
    </Box>
  );
};

export default KebabMenu;
