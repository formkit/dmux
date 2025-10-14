import React from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../types.js';

interface PaneCardProps {
  pane: DmuxPane;
  selected: boolean;
}

const PaneCard: React.FC<PaneCardProps> = ({ pane, selected }) => {
  // Get status indicator
  const getStatusIcon = () => {
    if (pane.agentStatus === 'working') return { icon: '✻', color: 'cyan' };
    if (pane.agentStatus === 'analyzing') return { icon: '⟳', color: 'magenta' };
    if (pane.agentStatus === 'waiting') return { icon: '⚠', color: 'yellow' };
    if (pane.testStatus === 'running') return { icon: '⏳', color: 'yellow' };
    if (pane.testStatus === 'failed') return { icon: '✗', color: 'red' };
    if (pane.testStatus === 'passed') return { icon: '✓', color: 'green' };
    if (pane.devStatus === 'running') return { icon: '▶', color: 'green' };
    return { icon: '◌', color: 'gray' };
  };

  const status = getStatusIcon();
  const prefix = selected ? '▸' : ' ';

  return (
    <Box>
      <Text color={selected ? 'cyan' : 'gray'}>{prefix} </Text>
      <Text color={status.color}>{status.icon} </Text>
      <Text color={selected ? 'cyan' : 'white'} bold={selected}>
        {pane.slug.substring(0, 25)}
      </Text>
      {pane.agent && (
        <Text color="gray"> [{pane.agent === 'claude' ? 'cc' : 'oc'}]</Text>
      )}
      {pane.autopilot && (
        <Text color="green"> (ap)</Text>
      )}
    </Box>
  );
};

export default PaneCard;