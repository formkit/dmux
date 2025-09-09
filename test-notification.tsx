#!/usr/bin/env tsx
import React from 'react';
import { render, Box, Text } from 'ink';

// Simulate the update notification display
const TestNotification = () => {
  const packageVersion = '1.6.0';
  const updateAvailable = true;
  const updateInfo = {
    latestVersion: '1.7.0',
    currentVersion: '1.6.0',
    hasUpdate: true,
    packageManager: 'npm' as const,
    installMethod: 'global' as const
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Testing Update Notification Display:</Text>
      </Box>
      
      <Box>
        <Text dimColor>
          dmux v{packageVersion}
          {updateAvailable && updateInfo && (
            <Text color="yellow"> • New version {updateInfo.latestVersion} available! Run: npm i -g dmux@latest</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};

render(<TestNotification />);