import React from 'react';
import { Box, Text } from 'ink';

interface CreatingIndicatorProps {
  message?: string;
}

const CreatingIndicator: React.FC<CreatingIndicatorProps> = ({ message }) => {
  return (
    <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow">
        <Text bold>⏳ Creating new pane... </Text>
        {message}
      </Text>
    </Box>
  );
};

export default CreatingIndicator;
