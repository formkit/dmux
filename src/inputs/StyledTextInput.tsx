import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface StyledTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

const StyledTextInput: React.FC<StyledTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type your message...'
}) => {
  return (
    <Box>
      <Text>{'> '}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        showCursor={true}
      />
    </Box>
  );
};

export default StyledTextInput;