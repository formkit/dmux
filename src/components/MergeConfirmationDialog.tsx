import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../types.js';

interface MergeConfirmationDialogProps {
  pane: DmuxPane;
}

const MergeConfirmationDialog: React.FC<MergeConfirmationDialogProps> = ({ pane }) => {
  return (
    <Box borderStyle="double" borderColor="yellow" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="yellow" bold>Worktree merged successfully!</Text>
        </Box>
        <Text>Close the pane "{pane.slug}"? (y/n)</Text>
      </Box>
    </Box>
  );
};

export default MergeConfirmationDialog;
