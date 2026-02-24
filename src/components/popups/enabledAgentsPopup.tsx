#!/usr/bin/env node

/**
 * Standalone popup for configuring enabled agents.
 * Allows multi-selection with space and scope selection before saving.
 */

import React, { useEffect, useMemo, useState } from "react"
import { render, Box, Text, useApp, useInput } from "ink"
import { readFileSync } from "fs"
import {
  PopupContainer,
  PopupWrapper,
  writeCancelAndExit,
  writeSuccessAndExit,
} from "./shared/index.js"
import { POPUP_CONFIG } from "./config.js"
import { getAgentShortLabel, type AgentName } from "../../utils/agentLaunch.js"
import { findAgentCommand } from "../../utils/agentDetection.js"

interface AgentItem {
  id: AgentName
  name: string
  defaultEnabled: boolean
}

interface PopupData {
  agents: AgentItem[]
  enabledAgents: AgentName[]
}

interface EnabledAgentsPopupProps {
  resultFile: string
  data: PopupData
}

const EnabledAgentsPopupApp: React.FC<EnabledAgentsPopupProps> = ({
  resultFile,
  data,
}) => {
  const [mode, setMode] = useState<"list" | "scope">("list")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scopeIndex, setScopeIndex] = useState(0)
  const [enabled, setEnabled] = useState<Set<AgentName>>(
    () => new Set(data.enabledAgents)
  )
  const [installStatus, setInstallStatus] = useState<
    Partial<Record<AgentName, "loading" | "installed" | "notInstalled">>
  >(() =>
    Object.fromEntries(
      data.agents.map((agent) => [agent.id, "loading"])
    ) as Partial<Record<AgentName, "loading" | "installed" | "notInstalled">>
  )
  const { exit } = useApp()

  useEffect(() => {
    let cancelled = false

    const checkInstalledSequentially = async () => {
      for (const agent of data.agents) {
        if (cancelled) return

        setInstallStatus((prev) => ({
          ...prev,
          [agent.id]: "loading",
        }))

        let installed = false
        try {
          installed = !!(await findAgentCommand(agent.id))
        } catch {
          installed = false
        }

        if (cancelled) return
        setInstallStatus((prev) => ({
          ...prev,
          [agent.id]: installed ? "installed" : "notInstalled",
        }))
      }
    }

    void checkInstalledSequentially()

    return () => {
      cancelled = true
    }
  }, [data.agents])

  const orderedEnabledAgents = useMemo(() => {
    return data.agents
      .map((agent) => agent.id)
      .filter((agentId) => enabled.has(agentId))
  }, [data.agents, enabled])
  const enabledCount = orderedEnabledAgents.length

  const toggleSelectedAgent = () => {
    const selected = data.agents[selectedIndex]
    if (!selected) return

    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(selected.id)) {
        next.delete(selected.id)
      } else {
        next.add(selected.id)
      }
      return next
    })
  }

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "scope") {
        setMode("list")
        return
      }
      writeCancelAndExit(resultFile, exit)
      return
    }

    if (mode === "list") {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(data.agents.length - 1, prev + 1))
        return
      }
      if (input === " ") {
        toggleSelectedAgent()
        return
      }
      if (key.return) {
        setMode("scope")
        setScopeIndex(0)
      }
      return
    }

    if (key.upArrow) {
      setScopeIndex((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setScopeIndex((prev) => Math.min(1, prev + 1))
      return
    }
    if (input === "g" || input === "G") {
      setScopeIndex(0)
      return
    }
    if (input === "p" || input === "P") {
      setScopeIndex(1)
      return
    }
    if (key.return) {
      writeSuccessAndExit(
        resultFile,
        {
          enabledAgents: orderedEnabledAgents,
          scope: scopeIndex === 0 ? "global" : "project",
        },
        exit
      )
    }
  })

  return (
    <PopupWrapper resultFile={resultFile}>
      <PopupContainer
        footer={
          mode === "list"
            ? "↑↓ navigate • Space toggle • Enter continue • ESC cancel"
            : "↑↓ navigate • Enter save • g/p quick scope • ESC back"
        }
      >
        {mode === "list" && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>
                Enabled agents appear in the new-pane selection popup.
              </Text>
              <Text dimColor>
                Install status is checked now for each agent.
              </Text>
              <Text color={POPUP_CONFIG.titleColor}>
                Enabled: {enabledCount}/{data.agents.length}
              </Text>
            </Box>

            {data.agents.length === 0 && <Text dimColor>No agents available</Text>}

            {data.agents.map((agent, index) => {
              const isSelected = index === selectedIndex
              const isEnabled = enabled.has(agent.id)
              const status = installStatus[agent.id] || "loading"
              const defaultTag = agent.defaultEnabled ? " · default" : ""
              const statusText =
                status === "installed"
                  ? "installed"
                  : status === "notInstalled"
                    ? "not installed"
                    : "checking"
              const statusColor =
                status === "installed"
                  ? POPUP_CONFIG.successColor
                  : status === "notInstalled"
                    ? POPUP_CONFIG.errorColor
                    : POPUP_CONFIG.dimColor
              const marker = isEnabled ? "◉" : "◎"
              const markerColor = isEnabled ? POPUP_CONFIG.successColor : "white"

              return (
                <Box key={agent.id}>
                  <Text color={markerColor} bold={isEnabled}>
                    {marker}
                  </Text>
                  <Text
                    color={isSelected ? POPUP_CONFIG.titleColor : "white"}
                    bold={isSelected}
                  >
                    {" "}
                    {agent.name}
                  </Text>
                  <Text color={isSelected ? POPUP_CONFIG.titleColor : "gray"}>
                    {" "}
                    {getAgentShortLabel(agent.id)}
                  </Text>
                  <Text color={statusColor} dimColor={status !== "notInstalled"}>
                    {"  "}
                    {statusText}{defaultTag}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}

        {mode === "scope" && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text bold>Save enabled agents as:</Text>
            </Box>
            <Box>
              <Text
                color={scopeIndex === 0 ? POPUP_CONFIG.titleColor : "white"}
                bold={scopeIndex === 0}
              >
                {scopeIndex === 0 ? "◉ " : "◎ "}
                Global (all projects)
              </Text>
            </Box>
            <Box>
              <Text
                color={scopeIndex === 1 ? POPUP_CONFIG.titleColor : "white"}
                bold={scopeIndex === 1}
              >
                {scopeIndex === 1 ? "◉ " : "◎ "}
                Project only
              </Text>
            </Box>
          </Box>
        )}
      </PopupContainer>
    </PopupWrapper>
  )
}

function main() {
  const resultFile = process.argv[2]
  const tempDataFile = process.argv[3]

  if (!resultFile || !tempDataFile) {
    console.error("Error: Result file and temp data file required")
    process.exit(1)
  }

  let data: PopupData
  try {
    data = JSON.parse(readFileSync(tempDataFile, "utf-8"))
  } catch {
    console.error("Error: Failed to read enabled agents data")
    process.exit(1)
  }

  render(<EnabledAgentsPopupApp resultFile={resultFile} data={data} />)
}

main()
