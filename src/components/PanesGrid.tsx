import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../types.js';
import type { AgentStatusMap } from '../hooks/useAgentStatus.js';
import PaneCard from './PaneCard.js';

interface PanesGridProps {
  panes: DmuxPane[];
  selectedIndex: number;
  isLoading: boolean;
  showNewPaneDialog: boolean;
  agentStatuses?: AgentStatusMap;
}

const PanesGrid: React.FC<PanesGridProps> = ({
  panes,
  selectedIndex,
  isLoading,
  showNewPaneDialog,
  agentStatuses
}) => {
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {panes.map((pane, index) => {
        // Apply the runtime status to the pane
        const paneWithStatus = {
          ...pane,
          agentStatus: agentStatuses?.get(pane.id) || pane.agentStatus
        };
        return (
          <PaneCard
            key={pane.id}
            pane={paneWithStatus}
            selected={selectedIndex === index}
          />
        );
      })}

      {!isLoading && !showNewPaneDialog && (
        <Box
          paddingX={0}
          paddingY={0}
          borderStyle="single"
          borderColor={selectedIndex === panes.length ? 'green' : 'gray'}
          width={35}
          flexShrink={0}
        >
          <Box paddingX={1}>
            <Text color={selectedIndex === panes.length ? 'green' : 'white'}>
              + New dmux pane
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default PanesGrid;
