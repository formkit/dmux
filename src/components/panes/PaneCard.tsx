import React, { memo } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import type { DmuxPane } from '../../types.js';
import { COLORS } from '../../theme/colors.js';

interface PaneCardProps {
  pane: DmuxPane;
  isDevSource: boolean;
  selected: boolean;
  isFocused?: boolean;
}

const ROW_WIDTH = 40;
const RIGHT_COLUMN_WIDTH = 10;
const LEFT_COLUMN_WIDTH = ROW_WIDTH - RIGHT_COLUMN_WIDTH;

const clipToWidth = (value: string, maxWidth: number): string => {
  if (maxWidth <= 0) return '';
  if (stringWidth(value) <= maxWidth) return value;

  let clipped = '';
  let currentWidth = 0;

  for (const char of value) {
    const charWidth = stringWidth(char);
    if (currentWidth + charWidth > maxWidth) {
      break;
    }
    clipped += char;
    currentWidth += charWidth;
  }

  return clipped;
};

const PaneCard: React.FC<PaneCardProps> = memo(({ pane, isDevSource, selected, isFocused }) => {
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

  // Right-aligned columns: [cc] = 4 chars, (ap) = 4 chars, space between = 1
  const hasAgent = pane.type === 'shell' || !!pane.agent;
  const agentTag = pane.type === 'shell'
    ? (pane.shellType || 'sh').substring(0, 2)
    : pane.agent === 'claude' ? 'cc' : pane.agent ? 'oc' : null;
  const apTag = pane.autopilot ? 'ap' : null;

  // Keep non-title segments fixed; only slug is allowed to clip.
  const prefix = isFocused ? '◆' : selected ? '▸' : ' ';
  const statusText = `${status.icon} `;
  const sourceText = isDevSource ? '★ ' : '';
  const agentText = hasAgent ? ` [${agentTag}]` : '     ';
  const autopilotText = apTag ? ` (${apTag})` : '     ';
  const fixedLeftWidth = stringWidth(prefix + statusText + sourceText);
  const maxSlugWidth = Math.max(0, LEFT_COLUMN_WIDTH - fixedLeftWidth);
  const slugText = clipToWidth(pane.slug, maxSlugWidth);

  return (
    <Box width={ROW_WIDTH}>
      <Box width={LEFT_COLUMN_WIDTH}>
        <Text color={selected ? COLORS.selected : COLORS.border}>{prefix}</Text>
        <Text color={status.color}>{statusText}</Text>
        {isDevSource && (
          <Text color="yellow">{sourceText}</Text>
        )}
        <Text color={selected ? COLORS.selected : COLORS.unselected} bold={selected}>
          {slugText}
        </Text>
      </Box>
      <Box width={RIGHT_COLUMN_WIDTH} justifyContent="flex-end">
        {agentTag
          ? <Text color={pane.type === 'shell' ? 'cyan' : 'gray'}>{agentText}</Text>
          : <Text>{agentText}</Text>
        }
        {apTag
          ? <Text color={COLORS.success}>{autopilotText}</Text>
          : <Text>{autopilotText}</Text>
        }
      </Box>
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
    prevProps.isFocused === nextProps.isFocused
  );
});

export default PaneCard;
