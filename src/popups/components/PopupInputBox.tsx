import React from 'react';
import { Box } from 'ink';
import { POPUP_CONFIG } from '../config.js';

interface PopupInputBoxProps {
  children: React.ReactNode;
}

/**
 * Reusable input container with themed borders
 */
export const PopupInputBox: React.FC<PopupInputBoxProps> = ({ children }) => {
  return (
    <Box
      borderStyle={POPUP_CONFIG.inputBorderStyle}
      borderColor={POPUP_CONFIG.inputBorderColor}
      paddingX={POPUP_CONFIG.inputPadding.x}
      paddingY={POPUP_CONFIG.inputPadding.y}
    >
      {children}
    </Box>
  );
};
