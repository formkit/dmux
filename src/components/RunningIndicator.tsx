import React from 'react';
import { Box, Text } from 'ink';

const RunningIndicator: React.FC = () => {
  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
      <Text color="blue">
        <Text bold>▶ Running command...</Text>
      </Text>
    </Box>
  );
};

export default RunningIndicator;
