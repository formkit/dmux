import React from 'react';
import { Box, Text } from 'ink';

interface FooterHelpProps {
  show: boolean;
  gridInfo?: string;
}

const FooterHelp: React.FC<FooterHelpProps> = ({ show, gridInfo }) => {
  if (!show) return null;
  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        Commands: [j]ump • [t]est • [d]ev • [o]pen • [x]close • [m]erge • [n]ew • [q]uit
      </Text>
      <Text dimColor>
        Use arrow keys (↑↓←→) for spatial navigation, Enter to select
      </Text>
      {gridInfo && (
        <Text dimColor>{gridInfo}</Text>
      )}
    </Box>
  );
};

export default FooterHelp;
