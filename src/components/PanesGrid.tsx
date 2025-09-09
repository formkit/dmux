import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../types.js';
import PaneCard from './PaneCard.js';

interface PanesGridProps {
  panes: DmuxPane[];
  selectedIndex: number;
  isLoading: boolean;
  showNewPaneDialog: boolean;
}

const PanesGrid: React.FC<PanesGridProps> = ({ panes, selectedIndex, isLoading, showNewPaneDialog }) => {
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {panes.map((pane, index) => (
        <PaneCard key={pane.id} pane={pane} selected={selectedIndex === index} />
      ))}

      {!isLoading && !showNewPaneDialog && (
        <Box
          paddingX={1}
          borderStyle="single"
          borderColor={selectedIndex === panes.length ? 'green' : 'gray'}
          width={35}
          flexShrink={0}
        >
          <Text color={selectedIndex === panes.length ? 'green' : 'white'}>
            + New dmux pane
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default PanesGrid;
