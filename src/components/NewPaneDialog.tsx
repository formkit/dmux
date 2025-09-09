import React from 'react';
import { Box, Text } from 'ink';
import CleanTextInput from '../CleanTextInput.js';

interface NewPaneDialogProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

const NewPaneDialog: React.FC<NewPaneDialogProps> = ({ value, onChange, onSubmit }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>Enter initial prompt (ESC to cancel):</Text>
      <Box borderStyle="round" borderColor="#E67E22" paddingX={1} marginTop={1}>
        <CleanTextInput
          value={value}
          onChange={onChange}
          onSubmit={(expandedValue) => onSubmit(expandedValue || value)}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor italic>
          Press Ctrl+O to open in $EDITOR for complex multi-line input
        </Text>
      </Box>
    </Box>
  );
};

export default NewPaneDialog;
