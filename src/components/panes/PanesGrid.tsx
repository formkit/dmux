import React, { memo, useMemo } from "react"
import { Box, Text } from "ink"
import type { DmuxPane } from "../../types.js"
import type { AgentStatusMap } from "../../hooks/useAgentStatus.js"
import PaneCard from "./PaneCard.js"
import { COLORS } from "../../theme/colors.js"
import {
  buildProjectActionLayout,
  type ProjectActionItem,
} from "../../utils/projectActions.js"
import { isActiveDevSourcePath } from "../../utils/devSource.js"

interface PanesGridProps {
  panes: DmuxPane[]
  selectedIndex: number
  isLoading: boolean
  agentStatuses?: AgentStatusMap
  activeDevSourcePath?: string
  fallbackProjectRoot: string
  fallbackProjectName: string
}

const PanesGrid: React.FC<PanesGridProps> = memo(({
  panes,
  selectedIndex,
  isLoading,
  agentStatuses,
  activeDevSourcePath,
  fallbackProjectRoot,
  fallbackProjectName,
}) => {
  const actionLayout = useMemo(
    () => buildProjectActionLayout(panes, fallbackProjectRoot, fallbackProjectName),
    [panes, fallbackProjectRoot, fallbackProjectName]
  )
  const paneGroups = actionLayout.groups

  // Compute sibling count map: how many other panes share the same worktree
  const siblingCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const pane of panes) {
      if (!pane.worktreePath) continue
      const count = panes.filter(p => p.worktreePath === pane.worktreePath).length - 1
      map.set(pane.id, count)
    }
    return map
  }, [panes])

  const actionsByProject = useMemo(() => {
    const map = new Map<string, { newAgent?: ProjectActionItem; terminal?: ProjectActionItem }>()
    for (const action of actionLayout.actionItems) {
      const entry = map.get(action.projectRoot) || {}
      if (action.kind === "new-agent") {
        entry.newAgent = action
      } else {
        entry.terminal = action
      }
      map.set(action.projectRoot, entry)
    }
    return map
  }, [actionLayout.actionItems])

  // Determine which project group the current selection belongs to
  const activeProjectRoot = useMemo(() => {
    // Check if selection is a pane
    const selectedPane = selectedIndex < panes.length ? panes[selectedIndex] : undefined
    if (selectedPane) {
      const group = paneGroups.find(g => g.panes.some(e => e.index === selectedIndex))
      return group?.projectRoot
    }
    // Check if selection is an action item
    const selectedAction = actionLayout.actionItems.find(a => a.index === selectedIndex)
    return selectedAction?.projectRoot
  }, [selectedIndex, panes, paneGroups, actionLayout.actionItems])

  const renderActionRow = (
    newAgentAction: ProjectActionItem,
    terminalAction: ProjectActionItem,
    selIdx: number,
    isActiveGroup: boolean,
    navigable: boolean
  ) => {
    const newSelected = navigable && selIdx === newAgentAction.index
    const termSelected = navigable && selIdx === terminalAction.index
    const eitherSelected = newSelected || termSelected

    const renderLabel = (kind: "new-agent" | "terminal", isSelected: boolean) => {
      const color = isSelected ? COLORS.selected : COLORS.border
      const showHotkey = isActiveGroup
      if (kind === "new-agent") {
        return showHotkey
          ? <Text color={color} bold={isSelected}><Text color="cyan">[n]</Text>ew agent</Text>
          : <Text color={color} bold={isSelected}>new agent</Text>
      }
      return showHotkey
        ? <Text color={color} bold={isSelected}><Text color="cyan">[t]</Text>erminal</Text>
        : <Text color={color} bold={isSelected}>terminal</Text>
    }

    return (
      <Box width={40}>
        <Text color={eitherSelected ? COLORS.selected : COLORS.border}>{eitherSelected ? "▸" : " "} </Text>
        {renderLabel("new-agent", newSelected)}
        <Text color={COLORS.border}>{"  "}</Text>
        {renderLabel("terminal", termSelected)}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {paneGroups.map((group, groupIndex) => (
        <Box key={group.projectRoot} flexDirection="column">
          <Text dimColor>{"══ "}{group.projectName}</Text>

          {group.panes.map((entry) => {
            const pane = entry.pane
            // Apply the runtime status to the pane
            const paneWithStatus = {
              ...pane,
              agentStatus: agentStatuses?.get(pane.id) || pane.agentStatus,
            }
            const paneIndex = entry.index
            const isSelected = selectedIndex === paneIndex
            const isDevSource = isActiveDevSourcePath(
              pane.worktreePath,
              activeDevSourcePath
            )

            return (
              <PaneCard
                key={pane.id}
                pane={paneWithStatus}
                isDevSource={isDevSource}
                selected={isSelected}
                siblingCount={siblingCountMap.get(pane.id) || 0}
              />
            )
          })}

          {!isLoading && actionLayout.multiProjectMode && activeProjectRoot !== group.projectRoot && (
            <Text>{" "}</Text>
          )}

          {!isLoading && actionLayout.multiProjectMode && activeProjectRoot === group.projectRoot && (() => {
            const groupActions = actionsByProject.get(group.projectRoot)
            const newAgentAction = groupActions?.newAgent
            const terminalAction = groupActions?.terminal

            if (!newAgentAction || !terminalAction) {
              return null
            }

            return renderActionRow(newAgentAction, terminalAction, selectedIndex, true, false)
          })()}
        </Box>
      ))}

      {!isLoading && !actionLayout.multiProjectMode && (() => {
        const newAgentAction = actionLayout.actionItems.find((item) => item.kind === "new-agent")
        const terminalAction = actionLayout.actionItems.find((item) => item.kind === "terminal")

        if (!newAgentAction || !terminalAction) {
          return null
        }

        return renderActionRow(newAgentAction, terminalAction, selectedIndex, true, true)
      })()}
    </Box>
  )
})

export default PanesGrid
