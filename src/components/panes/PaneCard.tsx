import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { DmuxPane } from '../../types.js';
import { COLORS } from '../../theme/colors.js';

interface PaneCardProps {
  pane: DmuxPane;
  isDevSource: boolean;
  selected: boolean;
  siblingCount: number;
}

const PaneCard: React.FC<PaneCardProps> = memo(({ pane, isDevSource, selected, siblingCount }) => {
  // Get status indicator
  const getStatusIcon = () => {
    if (pane.agentStatus === 'working') return { icon: '✻', color: COLORS.working };
    if (pane.agentStatus === 'analyzing') return { icon: '⟳', color: COLORS.analyzing };
    if (pane.agentStatus === 'waiting') return { icon: '△', color: COLORS.waiting };
    if (pane.testStatus === 'running') return { icon: '⧖', color: COLORS.warning };
    if (pane.testStatus === 'failed') return { icon: '✗', color: COLORS.error };
    if (pane.testStatus === 'passed') return { icon: '✓', color: COLORS.success };
    if (pane.devStatus === 'running') return { icon: '▶', color: COLORS.success };
    return { icon: '◌', color: COLORS.border };
  };

  const status = getStatusIcon();

  return (
    <Box width={40}>
      <Text color={selected ? COLORS.selected : COLORS.border}>{selected ? '▸' : ' '} </Text>
      <Text color={status.color}>{status.icon} </Text>
      <Text color={selected ? COLORS.selected : COLORS.unselected} bold={selected}>
        {pane.slug.substring(0, isDevSource ? 18 : 25)}
      </Text>
      {isDevSource && (
        <Text color="yellow"> [source]</Text>
      )}
      {pane.type === 'shell' ? (
        <Text color="cyan"> [{pane.shellType || 'shell'}]</Text>
      ) : pane.agent && (
        <Text color="gray"> [{pane.agent === 'claude' ? 'cc' : 'oc'}]</Text>
      )}
      {pane.autopilot && (
        <Text color={COLORS.success}> (ap)</Text>
      )}
      {siblingCount > 0 && (
        <Text color="gray"> ({siblingCount + 1})</Text>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.pane.id === nextProps.pane.id &&
    prevProps.pane.slug === nextProps.pane.slug &&
    prevProps.pane.agentStatus === nextProps.pane.agentStatus &&
    prevProps.pane.testStatus === nextProps.pane.testStatus &&
    prevProps.pane.devStatus === nextProps.pane.devStatus &&
    prevProps.pane.autopilot === nextProps.pane.autopilot &&
    prevProps.pane.type === nextProps.pane.type &&
    prevProps.pane.shellType === nextProps.pane.shellType &&
    prevProps.pane.agent === nextProps.pane.agent &&
    prevProps.isDevSource === nextProps.isDevSource &&
    prevProps.selected === nextProps.selected &&
    prevProps.siblingCount === nextProps.siblingCount
  );
});

export default PaneCard;
