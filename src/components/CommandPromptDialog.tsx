import React from 'react';
import { Box, Text } from 'ink';
import StyledTextInput from '../StyledTextInput.js';

interface CommandPromptDialogProps {
  type: 'test' | 'dev';
  value: string;
  onChange: (v: string) => void;
}

const CommandPromptDialog: React.FC<CommandPromptDialogProps> = ({ type, value, onChange }) => {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text color="magenta" bold>
          Configure {type === 'test' ? 'Test' : 'Dev'} Command
        </Text>
        <Text dimColor>
          Enter command to run {type === 'test' ? 'tests' : 'dev server'} in worktrees
        </Text>
        <Text dimColor>
          (Press Enter with empty input for suggested command, ESC to cancel)
        </Text>
        <Box marginTop={1}>
          <StyledTextInput
            value={value}
            onChange={onChange}
            placeholder={type === 'test' ? 'e.g., npm test, pnpm test' : 'e.g., npm run dev, pnpm dev'}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default CommandPromptDialog;
