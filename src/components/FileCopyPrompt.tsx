import React from 'react';
import { Box, Text } from 'ink';

const FileCopyPrompt: React.FC = () => {
  return (
    <Box borderStyle="double" borderColor="yellow" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text color="yellow" bold>First Run Setup</Text>
        <Text>
          Copy non-git files (like .env, configs) from main to worktree?
        </Text>
        <Text dimColor>
          This includes files not tracked by git but excludes node_modules, dist, etc.
        </Text>
        <Box marginTop={1}>
          <Text>(y/n):</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default FileCopyPrompt;
