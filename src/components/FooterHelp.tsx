import React from 'react';
import { Box, Text } from 'ink';

interface FooterHelpProps {
  show: boolean;
  gridInfo?: string;
  showRemoteKey?: boolean;
  quitConfirmMode?: boolean;
  hasSidebarLayout?: boolean;
}

const FooterHelp: React.FC<FooterHelpProps> = ({ show, gridInfo, showRemoteKey = false, quitConfirmMode = false, hasSidebarLayout = false }) => {
  if (!show) return null;

  if (quitConfirmMode) {
    return (
      <Box marginTop={1}>
        <Text color="yellow" bold>
          Press Ctrl+C again to exit, or ESC to continue
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        Commands: [j]ump • [m]enu • [x]close • [n]ew • [s]ettings{hasSidebarLayout && ' • [l]ayout'}{showRemoteKey && ' • [r]emote'} • [q]uit
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
