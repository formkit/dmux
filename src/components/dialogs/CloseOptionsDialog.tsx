import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../../types.js';

interface CloseOptionsDialogProps {
  pane: DmuxPane;
  selectedIndex: number; // 0..3
}

const CloseOptionsDialog: React.FC<CloseOptionsDialogProps> = ({ pane, selectedIndex }) => {
  return (
    <Box borderStyle="double" borderColor="red" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="red" bold>Close pane "{pane.slug}"?</Text>
        </Box>
        <Box flexDirection="column">
          <Box>
            <Text color={selectedIndex === 0 ? 'cyan' : 'white'}>
              {selectedIndex === 0 ? '▶ ' : '  '}Merge & Prune - Merge worktree to main and close
            </Text>
          </Box>
          <Box>
            <Text color={selectedIndex === 1 ? 'cyan' : 'white'}>
              {selectedIndex === 1 ? '▶ ' : '  '}Merge Only - Merge worktree but keep pane open
            </Text>
          </Box>
          <Box>
            <Text color={selectedIndex === 2 ? 'cyan' : 'white'}>
              {selectedIndex === 2 ? '▶ ' : '  '}Delete Unsaved - Remove worktree (discard changes)
            </Text>
          </Box>
          <Box>
            <Text color={selectedIndex === 3 ? 'cyan' : 'white'}>
              {selectedIndex === 3 ? '▶ ' : '  '}Just Close - Close pane only
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑/↓ to navigate • Enter to select • ESC to cancel</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default CloseOptionsDialog;
