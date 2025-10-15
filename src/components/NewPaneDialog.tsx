import React from 'react';
import { Box, Text } from 'ink';
import CleanTextInput from '../CleanTextInput.js';
import { COLORS } from '../theme/colors.js';

interface NewPaneDialogProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}

const NewPaneDialog: React.FC<NewPaneDialogProps> = ({ value, onChange, onSubmit }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>Enter initial prompt (ESC to cancel):</Text>
      <Box borderStyle="round" borderColor={COLORS.accent} paddingX={1} marginTop={1}>
        <CleanTextInput
          value={value}
          onChange={onChange}
          onSubmit={(expandedValue) => onSubmit(expandedValue || value)}
        />
      </Box>
    </Box>
  );
};

export default NewPaneDialog;
