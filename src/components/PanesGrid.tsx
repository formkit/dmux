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
    <Box flexDirection="column">
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
        <Box>
          <Text color={selectedIndex === panes.length ? 'cyan' : 'gray'}>
            {selectedIndex === panes.length ? '▸' : ' '}
          </Text>
          <Text color={selectedIndex === panes.length ? 'green' : 'gray'}>+ </Text>
          <Text color={selectedIndex === panes.length ? 'cyan' : 'white'} bold={selectedIndex === panes.length}>
            New dmux pane
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default PanesGrid;
