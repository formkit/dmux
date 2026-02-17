import React, { memo, useMemo } from "react"
import { Box, Text } from "ink"
import type { DmuxPane } from "../../types.js"
import type { AgentStatusMap } from "../../hooks/useAgentStatus.js"
import PaneCard from "./PaneCard.js"
import { COLORS } from "../../theme/colors.js"
import { groupPanesByProject } from "../../utils/paneGrouping.js"

interface PanesGridProps {
  panes: DmuxPane[]
  selectedIndex: number
  isLoading: boolean
  agentStatuses?: AgentStatusMap
  fallbackProjectRoot: string
  fallbackProjectName: string
}

const PanesGrid: React.FC<PanesGridProps> = memo(({
  panes,
  selectedIndex,
  isLoading,
  agentStatuses,
  fallbackProjectRoot,
  fallbackProjectName,
}) => {
  // Two buttons at the end: "new agent" and "new terminal"
  const paneGroups = useMemo(
    () => groupPanesByProject(panes, fallbackProjectRoot, fallbackProjectName),
    [panes, fallbackProjectRoot, fallbackProjectName]
  )

  return (
    <Box flexDirection="column">
      {paneGroups.map((group, groupIndex) => (
        <Box key={group.projectRoot} flexDirection="column">
          {paneGroups.length > 1 && (
            <Box flexDirection="column">
              {groupIndex > 0 && (
                <Text color={COLORS.border}>{"─".repeat(40)}</Text>
              )}
              <Box width={40}>
                <Text color={COLORS.accent}> {group.projectName}</Text>
              </Box>
            </Box>
          )}

          {group.panes.map((entry, localIndex) => {
            const pane = entry.pane
            // Apply the runtime status to the pane
            const paneWithStatus = {
              ...pane,
              agentStatus: agentStatuses?.get(pane.id) || pane.agentStatus,
            }
            const paneIndex = entry.index
            const isSelected = selectedIndex === paneIndex
            const isFirstPane = localIndex === 0
            const isLastPane = localIndex === group.panes.length - 1
            const nextPaneIndex = group.panes[localIndex + 1]?.index
            const isNextSelected = nextPaneIndex !== undefined && selectedIndex === nextPaneIndex

            return (
              <PaneCard
                key={pane.id}
                pane={paneWithStatus}
                selected={isSelected}
                isFirstPane={isFirstPane}
                isLastPane={isLastPane}
                isNextSelected={isNextSelected}
              />
            )
          })}
        </Box>
      ))}

      {!isLoading && (
        <Box marginTop={panes.length === 0 ? 1 : 0} flexDirection="row" gap={1}>
          <Box
            borderStyle="round"
            borderColor={
              selectedIndex === panes.length
                ? COLORS.borderSelected
                : COLORS.border
            }
            paddingX={1}
          >
            <Text
              color={
                selectedIndex === panes.length ? COLORS.success : COLORS.border
              }
            >
              +{" "}
            </Text>
            <Text
              color={
                selectedIndex === panes.length
                  ? COLORS.selected
                  : COLORS.unselected
              }
              bold={selectedIndex === panes.length}
            >
              <Text color={COLORS.accent}>[n]</Text>ew agent
            </Text>
          </Box>
          <Box
            borderStyle="round"
            borderColor={
              selectedIndex === panes.length + 1
                ? COLORS.borderSelected
                : COLORS.border
            }
            paddingX={1}
          >
            <Text
              color={
                selectedIndex === panes.length + 1
                  ? COLORS.success
                  : COLORS.border
              }
            >
              +{" "}
            </Text>
            <Text
              color={
                selectedIndex === panes.length + 1
                  ? COLORS.selected
                  : COLORS.unselected
              }
              bold={selectedIndex === panes.length + 1}
            >
              <Text color={COLORS.accent}>[t]</Text>erminal
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
})

export default PanesGrid
