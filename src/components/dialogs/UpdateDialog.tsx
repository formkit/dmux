import React from 'react';
import { Box, Text } from 'ink';

interface UpdateDialogProps {
  updateInfo: any;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ updateInfo }) => {
  if (!updateInfo) return null;
  return (
    <Box borderStyle="double" borderColor="green" paddingX={1} marginTop={1}>
      <Box flexDirection="column">
        <Text color="green" bold>🎉 dmux Update Available!</Text>
        <Text>
          Current version: <Text color="cyan">{updateInfo.currentVersion}</Text>
        </Text>
        <Text>
          Latest version: <Text color="green">{updateInfo.latestVersion}</Text>
        </Text>
        {updateInfo.installMethod === 'global' && updateInfo.packageManager && (
          <Text>
            Detected global install via: <Text color="yellow">{updateInfo.packageManager}</Text>
          </Text>
        )}
        <Box marginTop={1}>
          {updateInfo.installMethod === 'global' && updateInfo.packageManager ? (
            <Text>
              [U]pdate now • [S]kip this version • [L]ater
            </Text>
          ) : (
            <Text>
              Manual update required: <Text color="cyan">{updateInfo.packageManager || 'npm'} update -g dmux</Text>
              {'\n'}[S]kip this version • [L]ater
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default UpdateDialog;
