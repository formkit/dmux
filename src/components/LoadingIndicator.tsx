import React from 'react';
import { Box, Text } from 'ink';

const LoadingIndicator: React.FC = () => {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={2} marginTop={1}>
      <Box flexDirection="row" gap={1}>
        <Text color="cyan">⏳</Text>
        <Text>Loading dmux sessions...</Text>
      </Box>
    </Box>
  );
};

export default LoadingIndicator;
