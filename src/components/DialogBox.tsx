import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

interface DialogBoxProps {
  children: React.ReactNode;
  borderColor?: string;
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
}

/**
 * DialogBox - A dialog container with a dark background
 * IMPORTANT: Only use this for dialogs in the main panel area, NOT in the sidebar
 * Ink doesn't support setting Box backgrounds, so we use a full-width dark background Text
 */
const DialogBox: React.FC<DialogBoxProps> = ({
  children,
  borderColor = 'gray',
  borderStyle = 'round',
  paddingX = 1,
  paddingY = 0,
  marginTop = 1,
}) => {
  // Very dark gray background for the dialog area
  const darkBg = chalk.bgHex('#080808');

  return (
    <Box marginTop={marginTop} flexDirection="column">
      {/* Full-width dark background bar above dialog */}
      <Text>{darkBg(''.padEnd(100, ' '))}</Text>

      <Box flexDirection="row">
        {/* Left dark background padding */}
        <Text>{darkBg(' ')}</Text>

        {/* Dialog content with border */}
        <Box
          flexDirection="column"
          borderStyle={borderStyle}
          borderColor={borderColor}
          paddingX={paddingX}
          paddingY={paddingY}
        >
          {children}
        </Box>

        {/* Right dark background padding */}
        <Text>{darkBg(' ')}</Text>
      </Box>

      {/* Full-width dark background bar below dialog */}
      <Text>{darkBg(''.padEnd(100, ' '))}</Text>
    </Box>
  );
};

export default DialogBox;
