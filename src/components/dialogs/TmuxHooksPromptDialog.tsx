/**
 * Tmux Hooks Prompt Dialog
 *
 * Shown on first startup to ask user if they want to install tmux hooks
 * for event-driven pane updates (lower CPU) vs polling fallback.
 */

import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface TmuxHooksPromptDialogProps {
  selectedIndex: number;
}

const TmuxHooksPromptDialog: React.FC<TmuxHooksPromptDialogProps> = memo(({
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
        <Text bold color="cyan">Performance Optimization</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text>dmux can install tmux hooks to detect pane changes instantly.</Text>
        <Text>This uses less CPU than polling and improves responsiveness.</Text>
        <Text dimColor>
          {'\n'}The hooks send signals to dmux when panes are created, closed, or resized.
        </Text>
      </Box>

      <Box flexDirection="column">
        {/* Yes option - install hooks */}
        <Box>
          {selectedIndex === 0 ? (
            <Text color="green" bold inverse>
              {'► '}Yes, install hooks (recommended){' '}
            </Text>
          ) : (
            <Text>
              {'  '}Yes, install hooks (recommended)
            </Text>
          )}
        </Box>

        {/* No option - use polling */}
        <Box>
          {selectedIndex === 1 ? (
            <Text color="yellow" bold inverse>
              {'► '}No, use polling instead{' '}
            </Text>
          ) : (
            <Text>
              {'  '}No, use polling instead
            </Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ to navigate • Enter to select • y/n shortcuts</Text>
      </Box>
    </Box>
  );
});

export default TmuxHooksPromptDialog;
