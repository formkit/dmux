import React from 'react';
import { Box, Text } from 'ink';

interface FooterHelpProps {
  show: boolean;
  gridInfo?: string;
  showRemoteKey?: boolean;
  quitConfirmMode?: boolean;
  hasSidebarLayout?: boolean;
  serverPort?: number;
  unreadErrorCount?: number;
  unreadWarningCount?: number;
  localIp?: string;
  tunnelUrl?: string | null;
  tunnelCreating?: boolean;
  tunnelSpinner?: string;
  tunnelCopied?: boolean;
}

const FooterHelp: React.FC<FooterHelpProps> = ({
  show,
  gridInfo,
  showRemoteKey = false,
  quitConfirmMode = false,
  hasSidebarLayout = false,
  serverPort,
  unreadErrorCount = 0,
  unreadWarningCount = 0,
  localIp,
  tunnelUrl,
  tunnelCreating = false,
  tunnelSpinner = '⠋',
  tunnelCopied = false
}) => {
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

  const hasErrors = unreadErrorCount > 0;
  const hasWarnings = unreadWarningCount > 0;

  // Divider component - uses borderStyle for full width
  const Divider = () => (
    <Box borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true} />
  );

  return (
    <Box marginTop={1} flexDirection="column">
      {/* Logs section with top border */}
      <Divider />
      <Box justifyContent="space-between">
        <Text>
          <Text>🪵 </Text>
          <Text color="cyan">[l]</Text>
          <Text bold>ogs</Text>
        </Text>
        {(hasErrors || hasWarnings) && (
          <Text>
            {hasErrors && <Text color="red" bold>{unreadErrorCount}</Text>}
            {hasErrors && hasWarnings && <Text dimColor> | </Text>}
            {hasWarnings && <Text color="yellow" bold>{unreadWarningCount}</Text>}
            <Text> </Text>
          </Text>
        )}
      </Box>

      {/* Network section with dividers - always show if server is running */}
      {(serverPort ?? 0) > 0 && (
        <>
          <Divider />
          {/* Local network IP */}
          <Text>
            <Text>🏠 </Text>
            <Text color="cyan">http://{localIp || '127.0.0.1'}:{serverPort}</Text>
          </Text>
          {/* Remote tunnel status */}
          <Text>
            <Text>🌐 </Text>
            {tunnelCopied ? (
              <Text color="green">Copied!</Text>
            ) : tunnelCreating ? (
              <>
                <Text color="yellow">{tunnelSpinner} </Text>
                <Text dimColor>Creating tunnel...</Text>
              </>
            ) : tunnelUrl ? (
              <>
                <Text color="green">Connected. </Text>
                <Text color="cyan">[r]</Text>
                <Text> to view</Text>
              </>
            ) : (
              <>
                <Text color="cyan">[r]</Text>
                <Text>emote tunnel</Text>
              </>
            )}
          </Text>
          <Divider />
        </>
      )}

      {/* Keyboard shortcuts */}
      <Text dimColor>
        Press <Text color="cyan">[?]</Text> for keyboard shortcuts
      </Text>

      {/* Debug info */}
      {gridInfo && (
        <Text dimColor>{gridInfo}</Text>
      )}
    </Box>
  );
};

export default FooterHelp;
