import React from 'react';
import { Box, Text } from 'ink';

interface KebabMenuProps {
  selectedOption: number;
  hasWorktree: boolean;
  paneName: string;
}

const KebabMenu: React.FC<KebabMenuProps> = ({ selectedOption, hasWorktree, paneName }) => {
  const options = [
    { key: 'v', label: 'View', description: 'Jump to pane' },
    ...(hasWorktree ? [{ key: 'm', label: 'Merge', description: 'Merge worktree' }] : []),
    { key: 'x', label: 'Close', description: 'Close pane' },
  ];

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
        <Box key={option.key}>
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
