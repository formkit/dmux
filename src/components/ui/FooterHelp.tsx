import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { Toast } from '../../services/ToastService.js';
import ToastNotification from './ToastNotification.js';

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
  currentToast?: Toast | null;
  toastQueueLength?: number;
  toastQueuePosition?: number | null;
}

const FooterHelp: React.FC<FooterHelpProps> = memo(({
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
  tunnelCopied = false,
  currentToast,
  toastQueueLength = 0,
  toastQueuePosition
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

  // Calculate toast height to reserve proper space (including header)
  const getToastHeight = () => {
    if (!currentToast) {
      // If no current toast but we have queued toasts, just show header (1 line)
      return toastQueueLength > 0 ? 1 : 0;
    }

    // Toast format: "✓ message"
    const iconAndSpaceLength = 2;
    const toastTextLength = iconAndSpaceLength + currentToast.message.length;

    // Available width (sidebar is 40, minus some padding)
    const availableWidth = 38;
    const wrappedLines = Math.ceil(toastTextLength / availableWidth);

    // Add 1 for header line
    return wrappedLines + 1;
  };

  const toastHeight = getToastHeight();

  // Generate notifications header with dynamic dashes
  const renderNotificationsHeader = () => {
    const totalCount = (currentToast ? 1 : 0) + toastQueueLength;
    if (totalCount === 0) return null;

    const countText = `(${totalCount})`;
    const label = 'Notifications';

    // Sidebar width is 40, calculate dashes to fill the line
    const sidebarWidth = 40;
    const contentLength = label.length + countText.length; // "Notifications(4)"
    const totalDashes = sidebarWidth - contentLength;

    // Distribute dashes: left (1) + middle + right (1)
    const leftDashes = 1;
    const rightDashes = 1;
    const middleDashes = Math.max(0, totalDashes - leftDashes - rightDashes);

    return (
      <Text dimColor>
        {'─'.repeat(leftDashes)}{label}{'─'.repeat(middleDashes)}{countText}{'─'.repeat(rightDashes)}
      </Text>
    );
  };

  // Check if we should show the notifications section
  const hasNotifications = currentToast !== null || toastQueueLength > 0;

  return (
    <Box marginTop={1} flexDirection="column">
      {/* Toast notification section - show header even when transitioning between toasts */}
      {hasNotifications ? (
        <Box height={toastHeight} marginBottom={1} flexDirection="column">
          {renderNotificationsHeader()}
          {currentToast && (
            <ToastNotification
              toast={currentToast}
              queuePosition={toastQueuePosition}
              totalInQueue={toastQueueLength}
            />
          )}
        </Box>
      ) : null}

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
                <Text color="cyan">[R]</Text>
                <Text> to view</Text>
              </>
            ) : (
              <>
                <Text color="cyan">[R]</Text>
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
});

export default FooterHelp;
