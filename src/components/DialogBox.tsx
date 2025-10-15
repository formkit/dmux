import React from 'react';
import { Box } from 'ink';

interface DialogBoxProps {
  children: React.ReactNode;
  borderColor?: string;
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
}

/**
 * DialogBox - A simple dialog container
 * Respects user's terminal background settings
 */
const DialogBox: React.FC<DialogBoxProps> = ({
  children,
  borderColor = 'gray',
  borderStyle = 'round',
  paddingX = 1,
  paddingY = 0,
  marginTop = 1,
}) => {
  return (
    <Box marginTop={marginTop} flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle={borderStyle}
        borderColor={borderColor}
        paddingX={paddingX}
        paddingY={paddingY}
      >
        {children}
      </Box>
    </Box>
  );
};

export default DialogBox;
