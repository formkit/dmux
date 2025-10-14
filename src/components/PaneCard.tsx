import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../types.js';

interface PaneCardProps {
  pane: DmuxPane;
  selected: boolean;
}

const PaneCard: React.FC<PaneCardProps> = ({ pane, selected }) => {
  let borderColor: any = 'gray';
  if (selected) borderColor = 'cyan';
  else if (pane.devStatus === 'running') borderColor = 'green';
  else if (pane.testStatus === 'running') borderColor = 'yellow';
  else if (pane.testStatus === 'failed') borderColor = 'red';

  return (
    <Box
      paddingX={0}
      paddingY={0}
      borderStyle="single"
      borderColor={borderColor}
      width={35}
      flexShrink={0}
    >
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" width="100%">
          <Box>
            <Text color="gray">⋮</Text>
            <Text> </Text>
            <Text color={selected ? 'cyan' : 'white'} bold wrap="truncate-end">
              {pane.slug.substring(0, 18)}
            </Text>
          </Box>
          <Box>
            {pane.autopilot && (
              <Text color="green">(ap)</Text>
            )}
            {pane.agent && (
              <Text color="gray"> ({pane.agent === 'claude' ? 'cc' : 'oc'})</Text>
            )}
          </Box>
        </Box>
        <Text color="gray" dimColor wrap="truncate">
          {pane.prompt.substring(0, 30)}
        </Text>

        {pane.agentStatus && (
          <Box>
            {pane.agentStatus === 'working' && (
              <Text color="cyan">✻ Working...</Text>
            )}
            {pane.agentStatus === 'analyzing' && (
              <Text color="magenta">⟳ Analyzing...</Text>
            )}
            {pane.agentStatus === 'waiting' && (
              <Text color="yellow" bold>⚠ Needs attention</Text>
            )}
            {pane.agentStatus === 'idle' && (
              <Text color="gray">◌ Idle</Text>
            )}
          </Box>
        )}

        {pane.analyzerError && (
          <Box>
            <Text color="red">⚠ {pane.analyzerError}</Text>
          </Box>
        )}

        {/* Test and Dev status indicators - commented out for now */}
        {/* {(pane.testStatus || pane.devStatus) && (
          <Box>
            {pane.testStatus === 'running' && (
              <Text color="yellow">⏳ Test</Text>
            )}
            {pane.testStatus === 'passed' && (
              <Text color="green">✓ Test</Text>
            )}
            {pane.testStatus === 'failed' && (
              <Text color="red">✗ Test</Text>
            )}
            {pane.devStatus === 'running' && (
              <Text color="green">
                ▶ Dev
                {pane.devUrl && (
                  <Text color="cyan" wrap="truncate"> {pane.devUrl.replace(/https?:\/\//, '').substring(0, 15)}</Text>
                )}
              </Text>
            )}
          </Box>
        )} */}
      </Box>
    </Box>
  );
};

export default PaneCard;