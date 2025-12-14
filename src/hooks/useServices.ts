import { useState, useMemo } from "react"
import { PopupManager, type PopupManagerConfig } from "../services/PopupManager.js"
import type { DmuxPane, ProjectSettings } from "../types.js"

interface UseServicesProps {
  // PopupManager config
  sidebarWidth: number
  projectRoot: string
  popupsSupported: boolean
  terminalWidth: number
  terminalHeight: number
  availableAgents: Array<"claude" | "opencode" | "vibe">
  agentChoice: "claude" | "opencode" | "vibe" | null
  serverPort?: number
  server?: any
  settingsManager: any
  projectSettings: ProjectSettings

  // Callbacks
  setStatusMessage: (msg: string) => void
  setIgnoreInput: (ignore: boolean) => void
  savePanes: (panes: DmuxPane[]) => Promise<void>
  loadPanes: () => Promise<void>
}

export function useServices(props: UseServicesProps) {
  // Initialize PopupManager
  const popupManager = useMemo(() => {
    const config: PopupManagerConfig = {
      sidebarWidth: props.sidebarWidth,
      projectRoot: props.projectRoot,
      popupsSupported: props.popupsSupported,
      terminalWidth: props.terminalWidth,
      terminalHeight: props.terminalHeight,
      availableAgents: props.availableAgents,
      agentChoice: props.agentChoice,
      serverPort: props.serverPort,
      server: props.server,
      settingsManager: props.settingsManager,
      projectSettings: props.projectSettings,
    }

    return new PopupManager(
      config,
      props.setStatusMessage,
      props.setIgnoreInput
    )
  }, [
    props.sidebarWidth,
    props.projectRoot,
    props.popupsSupported,
    props.terminalWidth,
    props.terminalHeight,
    props.availableAgents,
    props.agentChoice,
    props.serverPort,
    props.server,
    props.settingsManager,
    props.projectSettings,
    props.setStatusMessage,
    props.setIgnoreInput,
  ])

  return {
    popupManager,
  }
}
