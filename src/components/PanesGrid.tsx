import React from "react"
import { Box, Text } from "ink"
import type { DmuxPane } from "../types.js"
import type { AgentStatusMap } from "../hooks/useAgentStatus.js"
import PaneCard from "./PaneCard.js"
import { COLORS } from "../theme/colors.js"

interface PanesGridProps {
  panes: DmuxPane[]
  selectedIndex: number
  isLoading: boolean
  showNewPaneDialog: boolean
  agentStatuses?: AgentStatusMap
}

const PanesGrid: React.FC<PanesGridProps> = ({
  panes,
  selectedIndex,
  isLoading,
  showNewPaneDialog,
  agentStatuses,
}) => {
  const totalItems = panes.length + (!isLoading && !showNewPaneDialog ? 1 : 0)
  const hasSelection = selectedIndex >= 0 && selectedIndex < totalItems

  return (
    <Box flexDirection="column">
      {panes.map((pane, index) => {
        // Apply the runtime status to the pane
        const paneWithStatus = {
          ...pane,
          agentStatus: agentStatuses?.get(pane.id) || pane.agentStatus,
        }
        const isSelected = selectedIndex === index
        const isFirstPane = index === 0
        const isLastPane = index === panes.length - 1
        const isNextSelected = selectedIndex === index + 1

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

      {!isLoading && !showNewPaneDialog && (
        <Box marginTop={panes.length === 0 ? 1 : 0}>
          <Box
            borderStyle="round"
            borderColor={selectedIndex === panes.length ? COLORS.borderSelected : COLORS.border}
            paddingX={1}
          >
            <Text color={selectedIndex === panes.length ? COLORS.success : COLORS.border}>
              +{" "}
            </Text>
            <Text
              color={selectedIndex === panes.length ? COLORS.selected : COLORS.unselected}
              bold={selectedIndex === panes.length}
            >
              <Text color={COLORS.accent}>[n]</Text>ew pane
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default PanesGrid
