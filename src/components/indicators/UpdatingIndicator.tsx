import React from 'react';
import { Box, Text } from 'ink';

const UpdatingIndicator: React.FC = () => {
  return (
    <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow">
        <Text bold>⬇ Updating dmux...</Text>
      </Text>
    </Box>
  );
};

export default UpdatingIndicator;
