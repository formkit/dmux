import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import CleanTextInput from '../../inputs/CleanTextInput.js';
import { PopupContainer, PopupInputBox, PopupWrapper, writeSuccessAndExit } from '../shared/index.js';
import { PopupFooters } from '../config.js';

interface SimpleInputPopupProps {
  resultFile: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  tip?: string;
}

/**
 * Template component for simple text input popups
 * Use this instead of creating a new popup file for basic input needs
 */
export const SimpleInputPopup: React.FC<SimpleInputPopupProps> = ({
  resultFile,
  message,
  placeholder = '',
  defaultValue = '',
  tip,
}) => {
  const [value, setValue] = useState(defaultValue);
  const { exit } = useApp();

  const handleSubmit = (submittedValue?: string) => {
    writeSuccessAndExit(resultFile, submittedValue || value, exit);
  };

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer footer={PopupFooters.input()}>
        <Box marginBottom={1}>
          <Text dimColor>{message}</Text>
        </Box>

        <Box marginBottom={1}>
          <PopupInputBox>
            <CleanTextInput
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
              placeholder={placeholder}
            />
          </PopupInputBox>
        </Box>

        {tip && (
          <Box>
            <Text dimColor italic>💡 {tip}</Text>
          </Box>
        )}
      </PopupContainer>
    </PopupWrapper>
  );
};
